import { clientIp, rateLimit } from "@/server/http/rate-limit";
import { readJson, route } from "@/server/http/route";
import { suggestChange } from "@/server/services/public-plan";

export const POST = route<{ token: string }>(async (req, { params }) => {
  rateLimit(`suggest:${clientIp(req.headers)}`, 10, 60_000);
  const result = await suggestChange(params.token, await readJson(req));
  return Response.json(result, { status: 201 });
});
