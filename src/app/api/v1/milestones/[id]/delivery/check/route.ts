import { DeliveryInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { checkDelivery } from "@/server/services/deliveries";

/** Freelancer: AI pre-check of uploaded files against the to-dos (nothing is sent to the client). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  return checkDelivery(auth, params.id, DeliveryInputSchema.parse(await readJson(req)));
});
