import { z } from "zod";
import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { fileLink } from "@/server/services/deliveries";

/** Signed link to a delivered file. Originals → 403 for the client until the milestone is paid. */
export const GET = route<{ id: string; index: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const index = z.coerce.number().int().min(0).max(9).parse(params.index);
  const kind = new URL(req.url).searchParams.get("kind") === "preview" ? "preview" : "original";
  return { url: await fileLink(auth, params.id, index, kind) };
});
