import { requireUser } from "@/server/http/auth";
import { clientIp, rateLimit } from "@/server/http/rate-limit";
import { readJson, route } from "@/server/http/route";
import { approvePlan } from "@/server/services/public-plan";

/** Requires a signed-in client (email code). Records consent for this exact plan version. */
export const POST = route<{ token: string }>(async (req, { params }) => {
  rateLimit(`approve:${clientIp(req.headers)}`, 20, 60_000);
  const auth = await requireUser(req);
  const userAgent = req.headers.get("user-agent") ?? "";
  return approvePlan(auth, params.token, await readJson(req), userAgent);
});
