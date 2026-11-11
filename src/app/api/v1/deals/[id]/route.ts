import { requireUser } from "@/server/http/auth";
import { route } from "@/server/http/route";
import { getDeal } from "@/server/services/deals";

export const GET = route<{ id: string }>(async (req, { params }) =>
  getDeal(await requireUser(req), params.id),
);
