import type { CreateDealInput } from "@/sdk/schemas";
import { requireUser } from "@/server/http/auth";
import { readJsonOrMultipart } from "@/server/http/body";
import { route } from "@/server/http/route";
import { createDeal, listMyDeals } from "@/server/services/deals";

export const GET = route(async (req) => listMyDeals(await requireUser(req)));

/** JSON, or multipart with a JSON "data" field and up to 8 "screenshots" files. */
export const POST = route(async (req) => {
  const auth = await requireUser(req);
  const { data, files } = await readJsonOrMultipart(req, "screenshots");
  const deal = await createDeal(auth, data as CreateDealInput, files);
  return Response.json(deal, { status: 201 });
});
