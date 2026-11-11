// DEMO_MODE only: "skip time" so a 72-hour auto-release or a 3-day honor period can be shown live.
// It only moves timestamps; the tick then makes the real PayPal calls (capture / reauthorize).
import { env } from "../env";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { findDeal } from "../repos/deals";
import { logEvent } from "../repos/milestones";
import { adminClient } from "../repos/supabase";
import { runTick } from "./jobs";

export type FastForward = "release" | "renewal";

export async function fastForward(auth: AuthContext, dealId: string, what: FastForward) {
  if (!env().DEMO_MODE)
    throw new AppError("FORBIDDEN", "Time skipping is only available in demo mode.");
  const admin = adminClient();
  const deal = await findDeal(admin, dealId);
  if (!deal || (deal.client_id !== auth.userId && deal.freelancer_id !== auth.userId)) {
    throw new AppError("NOT_FOUND", "Deal not found.");
  }
  const past = new Date(Date.now() - 1000).toISOString();

  // release: only milestones that already have a consent-based release time (no consent → nothing to skip).
  // renewal: pretend the 3-day honor period is over, so the tick asks PayPal to reauthorize for real.
  const { data, error } =
    what === "release"
      ? await admin
          .from("milestones")
          .update({ release_at: past })
          .eq("deal_id", dealId)
          .eq("status", "delivered")
          .not("release_at", "is", null)
          .select("id")
      : await admin
          .from("milestones")
          .update({ honor_expires_at: past })
          .eq("deal_id", dealId)
          .in("status", ["held", "delivered", "changes_requested"])
          .not("authorization_id", "is", null)
          .select("id");
  if (error) throw new AppError("INTERNAL", "Could not skip time.", { db: error.code });
  if (!data || data.length === 0) {
    throw new AppError(
      "CONFLICT",
      what === "release"
        ? "Nothing to auto-release: no delivered milestone with auto-release consent."
        : "No active PayPal hold to renew.",
    );
  }
  await logEvent(admin, {
    deal_id: dealId,
    actor_role: deal.freelancer_id === auth.userId ? "freelancer" : "client",
    type: "demo_time_skipped",
    payload: { what, milestones: data.length },
  });
  return { skipped: what, milestones: data.length, tick: await runTick({ dealId }) };
}

// ── Judge access ─────────────────────────────────────────────────────────────

/**
 * "Try as freelancer / client": signs in to a seeded demo account on the server, so the password never
 * reaches the browser. Returns a normal Supabase session (the browser stores it with setSession).
 */
export async function demoLogin(as: "freelancer" | "client") {
  const e = env();
  if (!e.DEMO_MODE)
    throw new AppError("FORBIDDEN", "Demo accounts are only available in demo mode.");
  const email = as === "freelancer" ? e.DEMO_FREELANCER_EMAIL : e.DEMO_CLIENT_EMAIL;
  if (
    !email ||
    !e.DEMO_PASSWORD ||
    !e.NEXT_PUBLIC_SUPABASE_URL ||
    !e.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new AppError("CONFLICT", "Demo accounts aren't set up on this server.");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: e.DEMO_PASSWORD });
  if (error || !data.session)
    throw new AppError("UPSTREAM", "Couldn't sign in to the demo account.");
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

// ── "Freelancer delivers now" (so one judge can run the whole client flow) ──

function sampleImage(label: string, dark: boolean): Promise<Buffer> {
  const esc = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bg = dark ? "#101828" : "#F3F5F4";
  const fg = dark ? "#FFFFFF" : "#0B6E5B";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">
    <rect width="900" height="560" fill="${bg}"/>
    <circle cx="450" cy="210" r="90" fill="none" stroke="${fg}" stroke-width="14"/>
    <text x="450" y="228" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="${fg}">NB</text>
    <text x="450" y="390" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="${fg}">${esc.slice(0, 48)}</text>
    <text x="450" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="${fg}" opacity="0.7">Northern Bean · sample deliverable</text>
  </svg>`;
  return import("sharp").then(({ default: sharp }) => sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * DEMO_MODE only, called by the client of the deal: delivers one sample image per to-do as the
 * freelancer (labelled sample files), so the review → AI check → approve-and-pay path can be tried alone.
 * `skipLast` leaves out the last to-do so the AI check has something to flag.
 */
export async function demoDeliver(auth: AuthContext, milestoneId: string, skipLast = false) {
  if (!env().DEMO_MODE) throw new AppError("FORBIDDEN", "Only available in demo mode.");
  const admin = adminClient();
  const { data: ms } = await admin
    .from("milestones")
    .select("id, deal_id")
    .eq("id", milestoneId)
    .maybeSingle();
  const deal = ms ? await findDeal(admin, (ms as { deal_id: string }).deal_id) : null;
  if (!deal || deal.client_id !== auth.userId)
    throw new AppError("NOT_FOUND", "Milestone not found.");
  const { data: todoRows } = await admin
    .from("todos")
    .select("label, position")
    .eq("milestone_id", milestoneId)
    .order("position");
  let todos = ((todoRows ?? []) as Array<{ label: string }>).map((t) => t.label);
  if (skipLast && todos.length > 1) todos = todos.slice(0, -1);

  const { createUploadSlots, deliverWork } = await import("./deliveries");
  const freelancer: AuthContext = { userId: deal.freelancer_id, email: null, db: admin };
  const names = todos.map(
    (t, i) =>
      `${i + 1}-${t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}.png`,
  );
  const images = await Promise.all(todos.map((t) => sampleImage(t, /dark/i.test(t))));
  const { slots } = await createUploadSlots(
    freelancer,
    milestoneId,
    names.map((name, i) => ({ name, size: images[i]!.byteLength })),
  );
  for (const [i, s] of slots.entries()) {
    const { error } = await admin.storage
      .from("deal-inputs")
      .uploadToSignedUrl(s.path, s.token, images[i]!, { contentType: "image/png" });
    if (error) throw new AppError("INTERNAL", "Couldn't upload the sample files.");
  }
  await logEvent(admin, {
    deal_id: deal.id,
    milestone_id: milestoneId,
    actor_role: "client",
    type: "demo_auto_delivery",
  });
  return deliverWork(freelancer, milestoneId, {
    note: "Sample delivery generated for the demo (one file per to-do).",
    files: slots.map((s, i) => ({ path: s.path, name: names[i]! })),
  });
}
