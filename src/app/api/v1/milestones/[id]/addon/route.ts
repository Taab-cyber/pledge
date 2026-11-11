import { AddonResponseInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { respondToAddon } from "@/server/services/scope";

/** Client: accept (→ secure it with its own PayPal hold) or decline an offered add-on. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { accept } = AddonResponseInputSchema.parse(await readJson(req));
  return respondToAddon(auth, params.id, accept);
});
