import { UpdateMeInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { getMe, updateMe } from "@/server/services/me";

export const GET = route(async (req) => getMe(await requireUser(req)));

export const PATCH = route(async (req) => {
  const auth = await requireUser(req);
  const input = UpdateMeInputSchema.parse(await readJson(req));
  return updateMe(auth, input);
});
