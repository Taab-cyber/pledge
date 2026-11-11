import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { approveAgentAction } from "@/server/services/agent";

/** Approve a Deal Agent proposal: the matching service makes the real call (e.g. PayPal capture). */
export const POST = route<{ id: string }>(async (req, { params }) =>
  approveAgentAction(await requireUser(req), params.id),
);
