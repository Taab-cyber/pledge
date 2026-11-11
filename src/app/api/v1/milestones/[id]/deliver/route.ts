import { DeliveryInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { deliverWork } from "@/server/services/deliveries";

/** Freelancer: submit the delivery (files already uploaded via /delivery/uploads). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  return deliverWork(auth, params.id, DeliveryInputSchema.parse(await readJson(req)));
});
