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
import { moneyDto, toDealDto } from "./deal-view";

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
  const [milestones, changes] = await Promise.all([
    listMilestones(auth.db, deal.id),
    listChangeRequests(auth.db, deal.id),
  ]);
  return toDealDto(deal, milestones, changes, auth.userId);
}

export async function listMyDeals(auth: AuthContext): Promise<DealList> {
  const deals = await listDeals(auth.db, auth.userId);
  return {
    deals: deals.map((d) => ({
      id: d.id,
      viewerRole: d.freelancer_id === auth.userId ? "freelancer" : "client",
      title: d.title || `Deal with ${d.client_name}`,
      status: d.status,
      clientName: d.client_name,
      total: moneyDto(d.total_minor, d.currency),
      currentVersion: d.current_version,
      createdAt: d.created_at,
    })),
  };
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
