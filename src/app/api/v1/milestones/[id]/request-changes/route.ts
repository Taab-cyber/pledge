import { RequestChangesInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { requestChanges } from "@/server/services/deliveries";

/** Client: ask for changes (uses a revision round, pauses auto-release). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { text } = RequestChangesInputSchema.parse(await readJson(req));
  return requestChanges(auth, params.id, text);
});
