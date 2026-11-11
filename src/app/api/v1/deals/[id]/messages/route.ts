import { MessageInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { sendClientMessage } from "@/server/services/scope";

/** Client: send a request about the deal; the scope guard flags extra work and drafts an add-on. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { text } = MessageInputSchema.parse(await readJson(req));
  return Response.json(await sendClientMessage(auth, params.id, text), { status: 201 });
});
