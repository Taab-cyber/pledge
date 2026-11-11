import { ConfirmHoldInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { confirmHold } from "@/server/services/payments";

/** Client: after approving in the PayPal window, the server authorizes the order with PayPal. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { orderId } = ConfirmHoldInputSchema.parse(await readJson(req));
  return confirmHold(auth, params.id, orderId);
});
