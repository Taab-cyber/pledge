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
  delivery: z.lazy(() => DeliveryDtoSchema).nullable(),
  payment: z.object({
    dueDate: z.string().nullable(),
    /** PayPal authorization id while a hold exists (shown for the sandbox split-screen). */
    authorizationId: z.string().nullable(),
    holdExpiresAt: z.string().nullable(),
    honorExpiresAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
    /** Auto-release time; null without consent or while changes are requested / hold at risk. */
    releaseAt: z.string().nullable(),
    capturedAt: z.string().nullable(),
    captureId: z.string().nullable(),
    captureStatus: z.string().nullable(),
    /** Actual figures from PayPal's capture response (seller_receivable_breakdown). */
    payout: z
      .object({
        gross: MoneyDtoSchema.nullable(),
        fee: MoneyDtoSchema.nullable(),
        net: MoneyDtoSchema.nullable(),
        received: MoneyDtoSchema.nullable(),
        fxRate: z.string().nullable(),
      })
      .nullable(),
    lastError: z
      .object({
        action: z.string().optional(),
        code: z.string().optional(),
        message: z.string().optional(),
        issue: z.string().optional(),
        debugId: z.string().optional(),
        at: z.string().optional(),
      })
      .passthrough()
      .nullable(),
  }),
});
export type MilestoneDto = z.infer<typeof MilestoneDtoSchema>;

export const EstimateDtoSchema = z.object({
  amount: MoneyDtoSchema,
  rate: z.string(),
  asOf: z.string(),
  note: z.literal("estimate, final rate set by PayPal"),
});

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
  kind: z.enum(["suggestion", "revision", "message"]),
  milestoneId: z.uuid().nullable(),
  fromRole: z.enum(["freelancer", "client"]),
  text: z.string(),
  aiChanges: z.array(z.string()).nullable(),
  /** Scope guard verdict for client messages. */
  scope: z.object({ inScope: z.boolean(), reason: z.string() }).nullable(),
  createdAt: z.string(),
});

export const CheckItemSchema = z.object({
  todo: z.string(),
  status: z.enum(["met", "missing", "unclear"]),
  reason: z.string(),
});
export const DeliveryCheckDtoSchema = z.object({
  items: z.array(CheckItemSchema),
  summary: z.string(),
  verdict: z.enum(["met", "missing", "unclear"]),
});
export type DeliveryCheckDto = z.infer<typeof DeliveryCheckDtoSchema>;

export const DeliveryDtoSchema = z.object({
  round: z.int(),
  note: z.string(),
  createdAt: z.string(),
  files: z.array(
    z.object({
      index: z.int(),
      name: z.string(),
      mime: z.string(),
      size: z.int(),
      /** Watermarked preview (signed, ~10 min); null for non-images. */
      previewUrl: z.string().nullable(),
      /** True when this viewer may download the original now. */
      originalAvailable: z.boolean(),
    }),
  ),
  aiCheck: DeliveryCheckDtoSchema.nullable(),
});

export const AgentActionDtoSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  title: z.string(),
  status: z.enum(["proposed", "approved", "executed", "dismissed", "auto_executed"]),
  /** Who should act on it: the client, the freelancer, or nobody (informational). */
  for: z.enum(["client", "freelancer", "both", "none"]),
  noticed: z.string().nullable(),
  wants: z.string().nullable(),
  milestoneId: z.uuid().nullable(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AgentActionDto = z.infer<typeof AgentActionDtoSchema>;

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
  /** Indicative totals in each side's home currency (null when same currency or unavailable). */
  estimates: z.object({
    freelancer: EstimateDtoSchema.nullable(),
    client: EstimateDtoSchema.nullable(),
  }),
  demoMode: z.boolean(),
  agentActions: z.array(z.lazy(() => AgentActionDtoSchema)),
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
  /** The other party: client name for freelancers, freelancer name for clients. */
  counterpartName: z.string(),
  /** Secured with PayPal, not charged yet (held / delivered / changes requested / at risk). */
  held: MoneyDtoSchema,
  released: MoneyDtoSchema,
  releasedThisMonth: MoneyDtoSchema,
  /** Plain-language next step for this viewer, or null when nothing is waiting on them. */
  nextStep: z.string().nullable(),
  waitingOnYou: z.boolean(),
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

// ── Milestone payments ───────────────────────────────────────────────────────

export const HoldOrderResultSchema = z.object({ orderId: z.string() });
export const ConfirmHoldInputSchema = z.object({ orderId: z.string().min(1).max(64) }).strict();
export const DeliverInputSchema = z
  .object({ note: z.string().trim().max(5000).default("") })
  .strict();
export const ReleaseInputSchema = z
  .object({
    /** DEMO_MODE only: ask the PayPal sandbox to decline this capture (negative testing). */
    simulateDecline: z.boolean().optional(),
  })
  .strict();
export const MilestoneActionResultSchema = z
  .object({
    status: z.enum(MILESTONE_STATUSES),
    captureStatus: z.string().optional(),
    releaseAt: z.string().nullable().optional(),
  })
  .passthrough();
export const RefundResultSchema = z.object({ refundId: z.string(), status: z.string() });

export const AppConfigSchema = z.object({
  demoMode: z.boolean(),
  paypalClientId: z.string().nullable(),
  countries: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        currency: z.string(),
        reason: z.string().nullable(),
      }),
    )
    .default([]),
  currencies: z.array(z.string()).default([]),
});

export const DemoLoginResultSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Deliveries, revisions, scope guard, add-ons (Phase 5) ────────────────────

const uploadedFile = z.object({
  path: z.string().min(1).max(400),
  name: z.string().trim().min(1).max(200),
});

export const UploadSlotsInputSchema = z
  .object({
    files: z
      .array(z.object({ name: z.string().trim().min(1).max(200), size: z.int().min(1) }))
      .min(1)
      .max(10),
  })
  .strict();
export const UploadSlotsResultSchema = z.object({
  slots: z.array(
    z.object({ name: z.string(), path: z.string(), token: z.string(), signedUrl: z.string() }),
  ),
});
export const DeliveryInputSchema = z
  .object({
    note: z.string().trim().max(5000).default(""),
    files: z.array(uploadedFile).max(10).default([]),
  })
  .strict();
export const CheckDeliveryResultSchema = z.object({ check: DeliveryCheckDtoSchema });
export const DeliverResultSchema = z.object({
  status: z.literal("delivered"),
  round: z.int(),
  releaseAt: z.string().nullable(),
  aiCheck: DeliveryCheckDtoSchema.nullable(),
});
export const RequestChangesInputSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export const RequestChangesResultSchema = z.object({
  status: z.literal("changes_requested"),
  revisionsLeft: z.int(),
});
export const TodoInputSchema = z.object({ done: z.boolean() }).strict();
export const MessageInputSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
export const MessageResultSchema = z.object({
  inScope: z.boolean(),
  reason: z.string(),
  proposal: z.object({ id: z.uuid(), title: z.string() }).nullable(),
});
export const AddonInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    todos: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
    amountMajor: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .pipe(z.string().regex(/^d+(.d+)?$/, "Use a plain amount like 60 or 60.50")),
    dueInDays: z.int().min(1).max(21),
    actionId: z.uuid().optional(),
  })
  .strict();
export const AddonResultSchema = z.object({ addonId: z.uuid(), status: z.literal("draft") });
export const AddonResponseInputSchema = z.object({ accept: z.boolean() }).strict();
