import { DeliverInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { deliverMilestone } from "@/server/services/payments";

/** Freelancer: mark the work delivered (files and the AI check arrive in Phase 5). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { note } = DeliverInputSchema.parse(await readJson(req));
  return deliverMilestone(auth, params.id, note);
});
