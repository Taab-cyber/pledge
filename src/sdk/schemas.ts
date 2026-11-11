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
