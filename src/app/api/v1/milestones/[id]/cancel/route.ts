import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { cancelHold } from "@/server/services/payments";

/** Freelancer: cancel (void) the PayPal hold for this milestone. */
export const POST = route<{ id: string }>(async (req, { params }) =>
  cancelHold(await requireUser(req), params.id),
);
