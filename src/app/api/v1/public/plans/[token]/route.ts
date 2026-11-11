import { clientIp, rateLimit } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { getPublicPlan } from "@/server/services/public-plan";

export const GET = route<{ token: string }>(async (req, { params }) => {
  rateLimit(`plan:${clientIp(req.headers)}`, 60, 60_000);
  return getPublicPlan(params.token);
});
