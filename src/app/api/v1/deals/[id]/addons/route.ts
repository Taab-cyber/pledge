import { AddonInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { proposeAddon } from "@/server/services/scope";

/** Freelancer: offer a paid add-on (optionally from a Deal Agent proposal). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  return Response.json(
    await proposeAddon(auth, params.id, AddonInputSchema.parse(await readJson(req))),
    {
      status: 201,
    },
  );
});
