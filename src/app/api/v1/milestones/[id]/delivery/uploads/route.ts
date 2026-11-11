import { UploadSlotsInputSchema } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { createUploadSlots } from "@/server/services/deliveries";

/** Freelancer: one-time upload URLs so files go straight to private storage (no 4.5 MB body limit). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const { files } = UploadSlotsInputSchema.parse(await readJson(req));
  return createUploadSlots(auth, params.id, files);
});
