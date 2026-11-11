import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { createHoldOrder } from "@/server/services/payments";

/** Client: create the PayPal order (intent AUTHORIZE) for this milestone. */
export const POST = route<{ id: string }>(async (req, { params }) =>
  createHoldOrder(await requireUser(req), params.id),
);
