// Freelancer-side deal use-cases: create, build plan with AI, edit, share, view, list.
import type { CreateDealInput, DealDto, DealList, EditPlanInput, ShareResult } from "@/sdk/schemas";
import { CreateDealInputSchema, EditPlanInputSchema } from "@/sdk/schemas";
import { isPlanEditable } from "../domain/deal-machine";
import { isScreenshotType, sniffFileType } from "../domain/files";
import { LIMITS, checkTotal } from "../domain/limits";
import { fromMajor, toMajorString } from "../domain/money";
import { planFromWeights } from "../domain/plan";
import { isOnboarded } from "../domain/profile";
import { generateShareToken, whatsappLink } from "../domain/share-token";
import { env } from "../env";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import type { ImageInput } from "../providers/ai";
import {
  deleteDeal,
  findDeal,
  insertDeal,
  listChangeRequests,
  listDeals,
  listMilestones,
  replacePlan,
  setSourceFiles,
  shareDealRpc,
  type DealRow,
  type SourceFile,
} from "../repos/deals";
import { getProfile } from "../repos/profiles";
import { downloadPrivate, removePrivate, uploadPrivate } from "../repos/storage";
import { adminClient } from "../repos/supabase";
import { aiFor, assertAiQuota } from "./ai";
import { listAgentActions, latestDeliveries } from "../repos/deliveries";
import { signedUrls } from "../repos/storage";
import { moneyDto, toDealDto } from "./deal-view";
import { estimate } from "./fx";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

async function requireFreelancer(auth: AuthContext) {
  const profile = await getProfile(auth.db, auth.userId);
  if (profile.role !== "freelancer") {
    throw new AppError("FORBIDDEN", "Only freelancers can create deals.");
  }
  if (!isOnboarded(profile)) {
    throw new AppError("FORBIDDEN", "Finish your profile (name, country, PayPal email) first.");
  }
  return profile;
}

/** Loads a deal the viewer can see (RLS), or NOT_FOUND. */
async function loadDeal(auth: AuthContext, dealId: string): Promise<DealRow> {
  const deal = await findDeal(auth.db, dealId);
  if (!deal) throw new AppError("NOT_FOUND", "Deal not found.");
  return deal;
}

async function loadOwnDeal(auth: AuthContext, dealId: string): Promise<DealRow> {
  const deal = await loadDeal(auth, dealId);
  if (deal.freelancer_id !== auth.userId) {
    throw new AppError("FORBIDDEN", "Only the freelancer can change this plan.");
  }
  return deal;
}

export async function getDeal(auth: AuthContext, dealId: string): Promise<DealDto> {
  const deal = await loadDeal(auth, dealId);
  const [milestones, changes, freelancer] = await Promise.all([
    listMilestones(auth.db, deal.id),
    listChangeRequests(auth.db, deal.id),
    getProfile(adminClient(), deal.freelancer_id),
  ]);
  // Display-only estimates in each side's home currency; failures just hide the estimate.
  const total = BigInt(deal.total_minor);
  const [forFreelancer, forClient] = await Promise.all([
    estimate(total, deal.currency, freelancer.country_code),
    estimate(total, deal.currency, deal.client_country),
  ]);
  const viewerRole = deal.freelancer_id === auth.userId ? "freelancer" : "client";
  const [deliveries, agentActions] = await Promise.all([
    deliveryDtos(auth, milestones, viewerRole),
    agentFeed(auth, deal.id, viewerRole),
  ]);
  return toDealDto(deal, milestones, changes, auth.userId, {
    estimates: { freelancer: forFreelancer, client: forClient },
    demoMode: env().DEMO_MODE,
    deliveries,
    agentActions,
  });
}

type DeliveryDto = NonNullable<DealDto["milestones"][number]["delivery"]>;

/** Latest delivery per milestone; previews get short-lived signed links, originals only after payment. */
async function deliveryDtos(
  auth: AuthContext,
  milestones: Awaited<ReturnType<typeof listMilestones>>,
  viewerRole: "freelancer" | "client",
): Promise<Map<string, DeliveryDto>> {
  const latest = await latestDeliveries(
    auth.db,
    milestones.map((m) => m.id),
  );
  const previewPaths = [...latest.values()].flatMap((d) =>
    d.files.map((f) => f.previewPath).filter((p): p is string => !!p),
  );
  const urls = await signedUrls(adminClient(), previewPaths, 600);
  const out = new Map<string, DeliveryDto>();
  for (const m of milestones) {
    const d = latest.get(m.id);
    if (!d) continue;
    out.set(m.id, {
      round: d.round,
      note: d.note,
      createdAt: d.created_at,
      files: d.files.map((f, index) => ({
        index,
        name: f.name,
        mime: f.mime,
        size: f.size,
        previewUrl: f.previewPath ? (urls.get(f.previewPath) ?? null) : null,
        originalAvailable: viewerRole === "freelancer" || m.status === "released",
      })),
      aiCheck: d.ai_check
        ? { items: d.ai_check.items, summary: d.ai_check.summary, verdict: d.ai_check.verdict }
        : null,
    });
  }
  return out;
}

/** Deal Agent feed, filtered to what this viewer should act on or see. */
async function agentFeed(
  auth: AuthContext,
  dealId: string,
  viewerRole: "freelancer" | "client",
): Promise<DealDto["agentActions"]> {
  const rows = await listAgentActions(auth.db, dealId);
  return rows
    .map((a) => {
      const d = a.detail as { for?: string; noticed?: string; wants?: string };
      const target =
        (["client", "freelancer", "both", "none"] as const).find((x) => x === d.for) ?? "both";
      return {
        id: a.id,
        kind: a.kind,
        title: a.title,
        status: a.status,
        for: target,
        noticed: d.noticed ?? null,
        wants: d.wants ?? null,
        milestoneId: a.milestone_id,
        detail: a.detail,
        createdAt: a.created_at,
      };
    })
    .filter((a) => a.for === viewerRole || a.for === "both" || a.for === "none");
}

export async function listMyDeals(auth: AuthContext): Promise<DealList> {
  const deals = await listDeals(auth.db, auth.userId);
  const ids = deals.map((d) => d.id);
  const [{ data: rows }, profiles] = await Promise.all([
    ids.length
      ? auth.db
          .from("milestones")
          .select("deal_id, kind, status, amount_minor, captured_at")
          .in("deal_id", ids)
      : Promise.resolve({ data: [] as unknown[] }),
    namesFor(deals.map((d) => d.freelancer_id)),
  ]);
  const ms = (rows ?? []) as Array<{
    deal_id: string;
    kind: string;
    status: string;
    amount_minor: number;
    captured_at: string | null;
  }>;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  return {
    deals: deals.map((d) => {
      const role = d.freelancer_id === auth.userId ? "freelancer" : "client";
      const mine = ms.filter((m) => m.deal_id === d.id);
      const sum = (pred: (m: (typeof mine)[number]) => boolean) =>
        mine.filter(pred).reduce((a, m) => a + m.amount_minor, 0);
      const held = sum((m) =>
        ["held", "delivered", "changes_requested", "hold_at_risk"].includes(m.status),
      );
      const released = sum((m) => m.status === "released");
      const releasedMonth = sum(
        (m) => m.status === "released" && !!m.captured_at && new Date(m.captured_at) >= monthStart,
      );
      const step = nextStep(
        role,
        d.status,
        mine.map((m) => ({ status: m.status, kind: m.kind })),
      );
      return {
        id: d.id,
        viewerRole: role,
        title: d.title || `Deal with ${d.client_name}`,
        status: d.status,
        clientName: d.client_name,
        counterpartName:
          role === "freelancer"
            ? d.client_name
            : (profiles.get(d.freelancer_id) ?? "Your freelancer"),
        total: moneyDto(d.total_minor, d.currency),
        currentVersion: d.current_version,
        createdAt: d.created_at,
        held: moneyDto(held, d.currency),
        released: moneyDto(released, d.currency),
        releasedThisMonth: moneyDto(releasedMonth, d.currency),
        nextStep: step.text,
        waitingOnYou: step.mine,
      };
    }),
  };
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await adminClient().from("profiles").select("id, full_name").in("id", unique);
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      p.full_name ?? "Your freelancer",
    ]),
  );
}

/** One plain sentence about what happens next, and whether it waits on this viewer. */
function nextStep(
  role: "freelancer" | "client",
  status: string,
  ms: Array<{ status: string; kind: string }>,
): { text: string | null; mine: boolean } {
  const has = (s: string) => ms.some((m) => m.status === s);
  const f = role === "freelancer";
  if (status === "draft")
    return f
      ? { text: ms.length ? "Review the plan and share it" : "Build the plan", mine: true }
      : { text: null, mine: false };
  if (status === "shared")
    return f
      ? { text: "Waiting for the client to approve", mine: false }
      : { text: "Review and approve the plan", mine: true };
  if (status === "completed") return { text: "Completed", mine: false };
  if (status === "cancelled") return { text: "Cancelled", mine: false };
  if (has("hold_at_risk"))
    return {
      text: f ? "Hold at risk: client must re-secure" : "Secure the milestone again",
      mine: !f,
    };
  if (has("delivered"))
    return { text: f ? "Waiting for the client to review" : "Review the delivery", mine: !f };
  if (has("changes_requested"))
    return { text: f ? "Client asked for changes" : "Waiting for the revised delivery", mine: f };
  if (ms.some((m) => m.kind === "addon" && m.status === "draft"))
    return { text: f ? "Add-on offered" : "Answer the add-on offer", mine: !f };
  if (has("held"))
    return { text: f ? "Secured: deliver the work" : "Secured, work in progress", mine: f };
  if (has("awaiting_hold"))
    return {
      text: f ? "Waiting for the client to secure payment" : "Secure the next milestone",
      mine: !f,
    };
  return { text: null, mine: false };
}

export async function createDeal(
  auth: AuthContext,
  rawInput: CreateDealInput,
  files: UploadedFile[],
): Promise<DealDto> {
  await requireFreelancer(auth);
  const input = CreateDealInputSchema.parse(rawInput);

  const total = fromMajor(input.totalMajor, input.currency);
  const totalIssue = checkTotal(total);
  if (totalIssue) {
    throw new AppError(
      "VALIDATION",
      `The total must be between ${LIMITS.totalMinMajor} and ${LIMITS.totalMaxMajor} ${input.currency}.`,
      {
        field: "totalMajor",
      },
    );
  }

  if (files.length > LIMITS.planMaxScreenshots) {
    throw new AppError("VALIDATION", `Add at most ${LIMITS.planMaxScreenshots} screenshots.`);
  }
  const screenshots = files.map((f) => {
    if (f.bytes.byteLength > LIMITS.uploadMaxBytes) {
      throw new AppError("PAYLOAD_TOO_LARGE", `"${f.name}" is larger than 20 MB.`);
    }
    const type = sniffFileType(f.bytes);
    if (!isScreenshotType(type)) {
      throw new AppError("UNSUPPORTED_FILE", `"${f.name}" isn't a PNG, JPEG or WebP image.`);
    }
    return { ...f, type };
  });
  const chatText = input.chatText?.trim() || null;
  if (!chatText && screenshots.length === 0) {
    throw new AppError("VALIDATION", "Add chat screenshots or type the deal details.");
  }

  const admin = adminClient();
  const dealId = await insertDeal(admin, {
    freelancer_id: auth.userId,
    client_name: input.clientName,
    client_whatsapp: input.clientWhatsapp,
    client_country: input.clientCountry,
    title: input.title ?? "",
    currency: input.currency,
    total_minor: Number(total.minor),
    source_text: chatText,
  });

  const stored: SourceFile[] = [];
  try {
    for (const [i, s] of screenshots.entries()) {
      const path = `${dealId}/source/${i + 1}.${s.type.ext}`;
      await uploadPrivate(admin, path, s.bytes, s.type.mime);
      stored.push({ path, mime: s.type.mime, size: s.bytes.byteLength });
    }
    if (stored.length) await setSourceFiles(admin, dealId, stored);
  } catch (err) {
    await removePrivate(
      admin,
      stored.map((s) => s.path),
    );
    await deleteDeal(admin, dealId);
    throw err;
  }
  return getDeal(auth, dealId);
}

/** Runs the AI on the deal's chat and replaces the draft plan. Amounts come from allocate(). */
export async function buildPlan(auth: AuthContext, dealId: string): Promise<DealDto> {
  const profile = await requireFreelancer(auth);
  const deal = await loadOwnDeal(auth, dealId);
  if (!isPlanEditable(deal.status)) {
    throw new AppError("CONFLICT", "This plan was already approved and can't be rebuilt.");
  }
  await assertAiQuota(auth.userId);

  const admin = adminClient();
  const images: ImageInput[] = await Promise.all(
    deal.source_files.map(async (f) => ({
      mimeType: f.mime as ImageInput["mimeType"],
      data: await downloadPrivate(admin, f.path),
    })),
  );
  const ai = aiFor(auth.userId);
  const draft = await ai.buildPlan({
    images,
    chatText: deal.source_text ?? undefined,
    totalMajor: toMajorString({ minor: BigInt(deal.total_minor), currency: deal.currency }),
    currency: deal.currency,
    startDate: new Date().toISOString().slice(0, 10),
    freelancerProfession: profile.profession ?? undefined,
  });
  if (draft.unreadable) {
    throw new AppError(
      "VALIDATION",
      "We couldn't read the chat. Try clearer screenshots, or type the deal details instead.",
    );
  }

  const plan = planFromWeights(deal.currency, BigInt(deal.total_minor), draft.milestones);
  await replacePlan(
    admin,
    deal.id,
    deal.title.trim() ? deal.title : draft.title,
    {
      summary: draft.summary,
      gaps: draft.gaps,
      confidence: draft.confidence,
      priceInChat: draft.priceInChat,
      promptVersion: "build-plan@1",
      provider: ai.name,
    },
    plan.milestones.map((m) => ({
      title: m.title,
      amount_minor: Number(m.amountMinor),
      due_in_days: m.dueInDays,
      revisions_included: m.revisionsIncluded,
      todos: m.todos,
    })),
  );
  return getDeal(auth, deal.id);
}

/** Saves the freelancer's edits. Sums may be off while editing; sharing is what's blocked. */
export async function editPlan(
  auth: AuthContext,
  dealId: string,
  rawInput: EditPlanInput,
): Promise<DealDto> {
  const deal = await loadOwnDeal(auth, dealId);
  if (!isPlanEditable(deal.status)) {
    throw new AppError("CONFLICT", "This plan was already approved and can't be edited.");
  }
  const input = EditPlanInputSchema.parse(rawInput);
  const milestones = input.milestones.map((m, i) => {
    let minor: bigint;
    try {
      minor = fromMajor(m.amountMajor, deal.currency).minor;
    } catch (err) {
      throw new AppError("VALIDATION", err instanceof Error ? err.message : "Invalid amount.", {
        milestone: i,
      });
    }
    if (minor < 1n) {
      throw new AppError("VALIDATION", "Each milestone needs an amount above zero.", {
        milestone: i,
      });
    }
    return {
      title: m.title,
      amount_minor: Number(minor),
      due_in_days: m.dueInDays,
      revisions_included: m.revisionsIncluded,
      todos: m.todos,
    };
  });
  await replacePlan(adminClient(), deal.id, input.title ?? null, null, milestones);
  return getDeal(auth, deal.id);
}

/** Snapshots a new version, rotates the link (old links stop working) and builds the WhatsApp message. */
export async function shareDeal(auth: AuthContext, dealId: string): Promise<ShareResult> {
  const profile = await requireFreelancer(auth);
  const view = await getDeal(auth, dealId);
  if (view.viewerRole !== "freelancer")
    throw new AppError("FORBIDDEN", "Only the freelancer can share.");
  if (!view.canShare) {
    throw new AppError("PLAN_INVALID", "Fix the plan before sharing.", { issues: view.issues });
  }
  const { token, hash } = generateShareToken();
  const version = await shareDealRpc(adminClient(), dealId, hash);

  const shareUrl = `${env().APP_URL.replace(/\/$/, "")}/p/${token}`;
  const message =
    `Hi ${view.clientName}, here's the plan for "${view.title}" (${view.total.formatted}, ` +
    `${view.milestones.length} milestone${view.milestones.length === 1 ? "" : "s"}). ` +
    `Have a look and approve it here: ${shareUrl} — ${profile.full_name}`;
  return {
    version,
    shareUrl,
    whatsappUrl: view.clientWhatsapp ? whatsappLink(view.clientWhatsapp, message) : null,
    message,
  };
}
