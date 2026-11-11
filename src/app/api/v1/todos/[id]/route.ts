import { TodoInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { setTodoDone } from "@/server/services/deliveries";

/** Freelancer: tick / untick a to-do. */
export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { done } = TodoInputSchema.parse(await readJson(req));
  return setTodoDone(auth, params.id, done);
});
