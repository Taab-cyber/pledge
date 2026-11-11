import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { shareDeal } from "@/server/services/deals";

export const POST = route<{ id: string }>(async (req, { params }) =>
  shareDeal(await requireUser(req), params.id),
);
