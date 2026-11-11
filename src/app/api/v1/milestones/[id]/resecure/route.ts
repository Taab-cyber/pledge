import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { resecureMilestone } from "@/server/services/payments";

/** Client: after a failed renewal, drop the at-risk hold and secure the milestone again. */
export const POST = route<{ id: string }>(async (req, { params }) =>
  resecureMilestone(await requireUser(req), params.id),
);
