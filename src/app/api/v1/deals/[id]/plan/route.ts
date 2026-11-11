import type { EditPlanInput } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { buildPlan, editPlan } from "@/server/services/deals";

/** Build (or rebuild) the plan with AI from the deal's chat. */
export const POST = route<{ id: string }>(async (req, { params }) =>
  buildPlan(await requireUser(req), params.id),
);

/** Save the freelancer's edits. */
export const PUT = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  return editPlan(auth, params.id, (await readJson(req)) as EditPlanInput);
});
