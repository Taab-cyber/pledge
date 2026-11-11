import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { dismissAgentAction } from "@/server/services/agent";

export const POST = route<{ id: string }>(async (req, { params }) =>
  dismissAgentAction(await requireUser(req), params.id),
);
