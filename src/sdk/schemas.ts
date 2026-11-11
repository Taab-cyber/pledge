// API contracts shared by the server (validation) and the SDK (typed responses).
// Plain zod only: no server imports here.
import { z } from "zod";

export const UserRoleSchema = z.enum(["freelancer", "client"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ProfileSchema = z.object({
  id: z.uuid(),
  role: UserRoleSchema.nullable(),
  full_name: z.string().nullable(),
  profession: z.string().nullable(),
  country_code: z.string().length(2).nullable(),
  paypal_email: z.string().nullable(),
  is_demo: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const MeResponseSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.string().nullable() }),
  profile: ProfileSchema,
  onboarded: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateMeInputSchema = z
  .object({
    role: UserRoleSchema,
    full_name: z.string().trim().min(1).max(120),
    profession: z.string().trim().max(120),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
    paypal_email: z.email().max(254),
  })
  .partial()
  .strict();
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  requestId: z.string(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ── Deals ────────────────────────────────────────────────────────────────────

export const CURRENCY_CODES = ["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "JPY"] as const;
export const DEAL_STATUSES = [
  "draft",
  "shared",
  "approved",
  "active",
  "completed",
  "cancelled",
] as const;
export const MILESTONE_STATUSES = [
  "draft",
  "awaiting_hold",
  "held",
  "hold_at_risk",
  "delivered",
  "changes_requested",
  "released",
  "voided",
] as const;

/** Amounts on the wire: integer minor units (safe as JSON numbers within our limits) + display string. */
export const MoneyDtoSchema = z.object({
  minor: z.int(),
  currency: z.string(),
  formatted: z.string(),
});
export type MoneyDto = z.infer<typeof MoneyDtoSchema>;

const majorAmount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Use a plain amount like 400 or 400.50"));

export const CreateDealInputSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    clientName: z.string().trim().min(1).max(120),
    clientWhatsapp: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s()-]/g, ""))
      .pipe(
        z
          .string()
          .regex(/^\+?\d{6,15}$/, "Use a phone number with country code, e.g. +447700900123"),
      ),
    clientCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
    currency: z.enum(CURRENCY_CODES),
    totalMajor: majorAmount,
    chatText: z.string().max(20_000).optional(),
  })
  .strict();
export type CreateDealInput = z.input<typeof CreateDealInputSchema>;

export const EditPlanInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    milestones: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            amountMajor: majorAmount,
            dueInDays: z.int().min(1).max(21),
            revisionsIncluded: z.int().min(0).max(10),
            todos: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type EditPlanInput = z.input<typeof EditPlanInputSchema>;

export const TodoDtoSchema = z.object({ id: z.uuid(), label: z.string(), done: z.boolean() });

export const MilestoneDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["milestone", "addon"]),
  position: z.int(),
  title: z.string(),
  amount: MoneyDtoSchema,
  dueInDays: z.int().nullable(),
  revisionsIncluded: z.int(),
  revisionsUsed: z.int(),
  status: z.enum(MILESTONE_STATUSES),
  todos: z.array(TodoDtoSchema),
});
export type MilestoneDto = z.infer<typeof MilestoneDtoSchema>;

export const PlanMetaDtoSchema = z.object({
  summary: z.string(),
  gaps: z.array(z.object({ question: z.string(), suggestedDefault: z.string() })),
  confidence: z.number(),
  priceInChat: z.object({ amount: z.string().nullable(), currency: z.string().nullable() }),
  /** True when the chat states a price that differs from the entered total: show both. */
  priceMismatch: z.boolean(),
});

export const PlanIssueDtoSchema = z.object({
  code: z.string(),
  milestone: z.int().optional(),
  todo: z.int().optional(),
  differenceMinor: z.int().optional(),
});

export const ChangeRequestDtoSchema = z.object({
  id: z.uuid(),
  fromRole: z.enum(["freelancer", "client"]),
  text: z.string(),
  aiChanges: z.array(z.string()).nullable(),
  createdAt: z.string(),
});

export const DealDtoSchema = z.object({
  id: z.uuid(),
  viewerRole: z.enum(["freelancer", "client"]),
  title: z.string(),
  status: z.enum(DEAL_STATUSES),
  currency: z.string(),
  total: MoneyDtoSchema,
  clientName: z.string(),
  clientCountry: z.string().nullable(),
  clientWhatsapp: z.string().nullable(),
  currentVersion: z.int(),
  autoReleaseHours: z.int(),
  hasScreenshots: z.boolean(),
  planMeta: PlanMetaDtoSchema.nullable(),
  milestones: z.array(MilestoneDtoSchema),
  sum: MoneyDtoSchema,
  difference: MoneyDtoSchema,
  issues: z.array(PlanIssueDtoSchema),
  canShare: z.boolean(),
  changeRequests: z.array(ChangeRequestDtoSchema),
  createdAt: z.string(),
});
export type DealDto = z.infer<typeof DealDtoSchema>;

export const DealListItemSchema = z.object({
  id: z.uuid(),
  viewerRole: z.enum(["freelancer", "client"]),
  title: z.string(),
  status: z.enum(DEAL_STATUSES),
  clientName: z.string(),
  total: MoneyDtoSchema,
  currentVersion: z.int(),
  createdAt: z.string(),
});
export const DealListSchema = z.object({ deals: z.array(DealListItemSchema) });
export type DealList = z.infer<typeof DealListSchema>;

export const ShareResultSchema = z.object({
  version: z.int(),
  shareUrl: z.url(),
  whatsappUrl: z.url().nullable(),
  message: z.string(),
});
export type ShareResult = z.infer<typeof ShareResultSchema>;

// ── Public plan (no login) ───────────────────────────────────────────────────

export const PublicPlanSchema = z.object({
  version: z.int(),
  /** open: can be approved · being_updated: freelancer is editing · approved · closed */
  state: z.enum(["open", "being_updated", "approved", "closed"]),
  title: z.string(),
  summary: z.string().nullable(),
  freelancer: z.object({
    name: z.string(),
    profession: z.string().nullable(),
    country: z.string().nullable(),
  }),
  clientName: z.string(),
  total: MoneyDtoSchema,
  autoReleaseHours: z.int(),
  milestones: z.array(
    z.object({
      position: z.int(),
      title: z.string(),
      amount: MoneyDtoSchema,
      dueInDays: z.int().nullable(),
      revisionsIncluded: z.int(),
      todos: z.array(z.string()),
    }),
  ),
  consentText: z.string(),
});
export type PublicPlan = z.infer<typeof PublicPlanSchema>;

export const SuggestChangeInputSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export const SuggestChangeResultSchema = z.object({
  received: z.literal(true),
  changes: z.array(z.string()),
});

export const ApprovePlanInputSchema = z
  .object({
    version: z.int().min(1),
    consent: z.literal(true, { error: "Tick the auto-release consent to continue." }),
  })
  .strict();
export const ApprovePlanResultSchema = z.object({
  dealId: z.uuid(),
  status: z.enum(DEAL_STATUSES),
});
