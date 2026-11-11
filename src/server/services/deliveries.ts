// Deliveries: direct-to-storage uploads, magic-byte checks, watermarked previews, AI check, revisions.
import { randomUUID } from "node:crypto";
import { checkVerdict, normalizeCheck, type DeliveryCheck } from "../domain/delivery";
import { isPreviewable, safeFileName, sniffFileType, type SniffedType } from "../domain/files";
import { LIMITS } from "../domain/limits";
import { canTransition, computeReleaseAt, consumeRevision } from "../domain/milestone-machine";
import { format, money } from "../domain/money";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { insertChangeRequest, type DealRow } from "../repos/deals";
import {
  insertAgentAction,
  insertDelivery,
  latestDeliveries,
  type DeliveryFile,
  type StoredCheck,
} from "../repos/deliveries";
import {
  hasConsentForVersion,
  logEvent,
  nextDeliveryRound,
  updateMilestoneIf,
  type PaymentMilestone,
} from "../repos/milestones";
import { getProfile } from "../repos/profiles";
import {
  createUploadSlot,
  downloadPrivate,
  movePrivate,
  removePrivate,
  signedUrl,
  uploadPrivate,
} from "../repos/storage";
import { adminClient } from "../repos/supabase";
import { aiFor, assertAiQuota } from "./ai";
import { makePreview, makeThumbnail } from "./images";
import { loadMilestone, requireParty } from "./payments";

const admin = () => adminClient();
const MAX_THUMBNAILS = 6;

const incomingPrefix = (deal: DealRow, ms: PaymentMilestone) =>
  `${deal.id}/deliveries/${ms.id}/incoming/`;

async function todosOf(milestoneId: string): Promise<string[]> {
  const { data, error } = await admin()
    .from("todos")
    .select("label, position")
    .eq("milestone_id", milestoneId)
    .order("position");
  if (error) throw new AppError("INTERNAL", "Could not load to-dos.");
  return (data as Array<{ label: string }>).map((t) => t.label);
}

function requireDeliverable(ms: PaymentMilestone) {
  if (!canTransition(ms.status, "deliver")) {
    throw new AppError("CONFLICT", "You can deliver once the client has secured this milestone.");
  }
}

// ── 1) Upload slots ──────────────────────────────────────────────────────────

export async function createUploadSlots(
  auth: AuthContext,
  milestoneId: string,
  files: Array<{ name: string; size: number }>,
) {
  const { ms, deal } = await loadMilestone(milestoneId);
  requireParty(deal, auth, "freelancer");
  requireDeliverable(ms);
  if (files.length === 0 || files.length > LIMITS.deliveryMaxFiles) {
    throw new AppError("VALIDATION", `Add 1 to ${LIMITS.deliveryMaxFiles} files.`);
  }
  const tooBig = files.find((f) => f.size > LIMITS.uploadMaxBytes);
  if (tooBig) throw new AppError("PAYLOAD_TOO_LARGE", `"${tooBig.name}" is larger than 20 MB.`);
  const slots = [];
  for (const f of files) {
    const slot = await createUploadSlot(admin(), `${incomingPrefix(deal, ms)}${randomUUID()}`);
    slots.push({ name: f.name, ...slot });
  }
  return { slots };
}

// ── 2) Read + validate uploaded files ────────────────────────────────────────

interface PreparedFile {
  name: string;
  incomingPath: string;
  bytes: Buffer;
  type: SniffedType;
}

async function prepareFiles(
  deal: DealRow,
  ms: PaymentMilestone,
  files: Array<{ path: string; name: string }>,
): Promise<PreparedFile[]> {
  if (files.length > LIMITS.deliveryMaxFiles) {
    throw new AppError("VALIDATION", `Add at most ${LIMITS.deliveryMaxFiles} files.`);
  }
  const prefix = incomingPrefix(deal, ms);
  const seen = new Set<string>();
  const out: PreparedFile[] = [];
  for (const f of files) {
    // Only files uploaded through this milestone's own slots are accepted.
    if (!f.path.startsWith(prefix) || f.path.includes("..") || seen.has(f.path)) {
      throw new AppError("VALIDATION", "One of the files doesn't belong to this delivery.");
    }
    seen.add(f.path);
    const bytes = await downloadPrivate(admin(), f.path).catch(() => {
      throw new AppError("VALIDATION", `"${f.name}" wasn't uploaded. Please try again.`);
    });
    if (bytes.byteLength > LIMITS.uploadMaxBytes) {
      throw new AppError("PAYLOAD_TOO_LARGE", `"${f.name}" is larger than 20 MB.`);
    }
    const type = sniffFileType(bytes);
    if (!type) {
      throw new AppError(
        "UNSUPPORTED_FILE",
        `"${f.name}" isn't a supported file (PNG, JPEG, WebP, SVG, PDF or ZIP).`,
      );
    }
    out.push({ name: f.name.slice(0, 120), incomingPath: f.path, bytes, type });
  }
  return out;
}

// ── 3) AI check (presence only) ──────────────────────────────────────────────

async function runCheck(
  userId: string,
  ms: PaymentMilestone,
  note: string,
  files: PreparedFile[],
): Promise<StoredCheck> {
  const todos = await todosOf(ms.id);
  await assertAiQuota(userId);
  const images = files.filter((f) => isPreviewable(f.type)).slice(0, MAX_THUMBNAILS);
  const thumbnails = await Promise.all(
    images.map(async (f) => ({
      mimeType: "image/jpeg" as const,
      data: await makeThumbnail(f.bytes, f.type.mime),
    })),
  );
  const ai = aiFor(userId);
  const raw = await ai.checkDelivery({
    milestoneTitle: ms.title,
    todos,
    note,
    files: files.map((f) => ({ name: f.name, mime: f.type.mime, sizeBytes: f.bytes.byteLength })),
    thumbnails,
  });
  const check: DeliveryCheck = normalizeCheck(todos, raw);
  return { ...check, verdict: checkVerdict(check), model: ai.name };
}

/** Freelancer's pre-flight: see what the AI thinks is missing before the client sees anything. */
export async function checkDelivery(
  auth: AuthContext,
  milestoneId: string,
  input: { note: string; files: Array<{ path: string; name: string }> },
) {
  const { ms, deal } = await loadMilestone(milestoneId);
  requireParty(deal, auth, "freelancer");
  requireDeliverable(ms);
  const files = await prepareFiles(deal, ms, input.files);
  return { check: await runCheck(auth.userId, ms, input.note, files) };
}

// ── 4) Deliver ───────────────────────────────────────────────────────────────

export async function deliverWork(
  auth: AuthContext,
  milestoneId: string,
  input: { note: string; files: Array<{ path: string; name: string }> },
) {
  const { ms, deal } = await loadMilestone(milestoneId);
  requireParty(deal, auth, "freelancer");
  requireDeliverable(ms);
  const files = await prepareFiles(deal, ms, input.files);

  // The AI check must never block a delivery: if the AI is down, the client just sees no check.
  let aiCheck: StoredCheck | null = null;
  try {
    aiCheck = await runCheck(auth.userId, ms, input.note, files);
  } catch (err) {
    console.error("checkDelivery failed", err instanceof Error ? err.message : err);
  }

  const round = await nextDeliveryRound(admin(), ms.id);
  const base = `${deal.id}/deliveries/${ms.id}/r${round}`;
  const stored: DeliveryFile[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${base}/original/${i + 1}-${safeFileName(f.name, f.type.ext)}`;
    await movePrivate(admin(), f.incomingPath, path);
    let previewPath: string | null = null;
    if (isPreviewable(f.type)) {
      try {
        previewPath = `${base}/preview/${i + 1}.jpg`;
        await uploadPrivate(
          admin(),
          previewPath,
          await makePreview(f.bytes, f.type.mime),
          "image/jpeg",
        );
      } catch (err) {
        previewPath = null; // e.g. an SVG sharp can't render: still delivered, just no preview
        console.error("preview failed", err instanceof Error ? err.message : err);
      }
    }
    stored.push({ name: f.name, mime: f.type.mime, size: f.bytes.byteLength, path, previewPath });
  }

  const deliveredAt = new Date();
  const consent = deal.client_id
    ? await hasConsentForVersion(admin(), deal.id, deal.current_version, deal.client_id)
    : false;
  const releaseAt = computeReleaseAt(deliveredAt, deal.auto_release_hours, consent);
  const updated = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: ms.status },
    {
      status: "delivered",
      delivered_at: deliveredAt.toISOString(),
      release_at: releaseAt?.toISOString() ?? null,
    },
  );
  if (!updated) {
    await removePrivate(
      admin(),
      stored.flatMap((s) => [s.path, ...(s.previewPath ? [s.previewPath] : [])]),
    );
    throw new AppError("CONFLICT", "This milestone changed. Reload and try again.");
  }
  const delivery = await insertDelivery(admin(), {
    milestone_id: ms.id,
    round,
    note: input.note.slice(0, 5000),
    files: stored,
    ai_check: aiCheck,
  });
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: ms.id,
    actor_role: "freelancer",
    type: "delivered",
    payload: {
      round,
      files: stored.length,
      verdict: aiCheck?.verdict ?? null,
      releaseAt: releaseAt?.toISOString() ?? null,
    },
  });

  // Deal Agent: a delivery that passes the check → propose releasing the payment to the client.
  if (aiCheck?.verdict === "met") {
    const freelancer = await getProfile(admin(), deal.freelancer_id);
    const amount = format(money(BigInt(ms.amount_minor), deal.currency));
    await insertAgentAction(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      kind: "release_payment",
      title: `Release ${amount} to ${freelancer.full_name ?? "the freelancer"}`,
      detail: {
        noticed: `All ${aiCheck.items.length} items in "${ms.title}" look delivered.`,
        wants: `Approve the delivery and let PayPal release ${amount}.`,
        for: "client",
      },
    });
  }
  return {
    status: "delivered" as const,
    round: delivery.round,
    releaseAt: releaseAt?.toISOString() ?? null,
    aiCheck,
  };
}

// ── Files: watermarked previews before payment, originals only after ────────

export async function fileLink(
  auth: AuthContext,
  milestoneId: string,
  index: number,
  kind: "original" | "preview",
): Promise<string> {
  const { ms, deal } = await loadMilestone(milestoneId);
  const isFreelancer = deal.freelancer_id === auth.userId;
  if (!isFreelancer) requireParty(deal, auth, "client");
  const latest = (await latestDeliveries(admin(), [ms.id])).get(ms.id);
  const file = latest?.files[index];
  if (!file) throw new AppError("NOT_FOUND", "File not found.");
  if (kind === "preview") {
    if (!file.previewPath) throw new AppError("NOT_FOUND", "No preview for this file.");
    return signedUrl(admin(), file.previewPath, 600);
  }
  // Originals unlock for the client only once PayPal has captured the payment.
  if (!isFreelancer && ms.status !== "released") {
    throw new AppError(
      "FORBIDDEN",
      "Original files unlock after you approve and pay this milestone.",
    );
  }
  return signedUrl(admin(), file.path, 120, file.name);
}

// ── Revisions ────────────────────────────────────────────────────────────────

export async function requestChanges(auth: AuthContext, milestoneId: string, text: string) {
  const { ms, deal } = await loadMilestone(milestoneId);
  requireParty(deal, auth, "client");
  if (!canTransition(ms.status, "request_changes")) {
    throw new AppError("CONFLICT", "You can ask for changes after a delivery.");
  }
  const rev = consumeRevision(ms.revisions_included, ms.revisions_used);
  if (!rev.allowed) {
    await insertAgentAction(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      kind: "propose_extra_revision",
      title: `Offer a paid extra revision round for "${ms.title}"`,
      detail: {
        noticed: `The client asked for changes, but all ${ms.revisions_included} included revision rounds are used.`,
        wants: "Send a small paid add-on for one more round.",
        clientNote: text.slice(0, 500),
        for: "freelancer",
      },
    });
    throw new AppError(
      "REVISIONS_USED_UP",
      "All included revision rounds are used. The freelancer can offer a paid extra round.",
      { suggestAddon: true },
    );
  }
  // Pauses auto-release; can't race a capture that is already in progress.
  const updated = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: "delivered", where: { capture_claim: null } },
    { status: "changes_requested", revisions_used: rev.revisionsUsed, release_at: null },
  );
  if (!updated)
    throw new AppError("CONFLICT", "Payment is already being released for this milestone.");

  let changes: string[] = [];
  try {
    changes = (
      await aiFor(auth.userId).summarizeChanges({ note: text, todos: await todosOf(ms.id) })
    ).changes;
  } catch {
    // summary is a nice-to-have
  }
  await insertChangeRequest(admin(), {
    deal_id: deal.id,
    from_role: "client",
    text,
    ai_summary: changes.length ? { changes } : null,
    milestone_id: ms.id,
    kind: "revision",
  });
  return { status: "changes_requested" as const, revisionsLeft: rev.remaining };
}

// ── To-dos ───────────────────────────────────────────────────────────────────

export async function setTodoDone(auth: AuthContext, todoId: string, done: boolean) {
  const { data, error } = await admin()
    .from("todos")
    .select("id, milestone_id")
    .eq("id", todoId)
    .maybeSingle();
  if (error && error.code !== "22P02") throw new AppError("INTERNAL", "Could not load the to-do.");
  if (!data) throw new AppError("NOT_FOUND", "To-do not found.");
  const { ms, deal } = await loadMilestone((data as { milestone_id: string }).milestone_id);
  requireParty(deal, auth, "freelancer");
  if (ms.status === "released" || ms.status === "voided") {
    throw new AppError("CONFLICT", "This milestone is closed.");
  }
  const { error: upErr } = await admin().from("todos").update({ done }).eq("id", todoId);
  if (upErr) throw new AppError("INTERNAL", "Could not update the to-do.");
  return { id: todoId, done };
}
