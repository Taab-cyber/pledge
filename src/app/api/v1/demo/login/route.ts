import { z } from "zod";
import { clientIp, rateLimit } from "@/server/http/rate-limit";
import { readJson, route } from "@/server/http/route";
import { demoLogin } from "@/server/services/demo";

/** DEMO_MODE only: "Try as freelancer / client" for judges. The password stays on the server. */
export const POST = route(async (req) => {
  rateLimit(`demo-login:${clientIp(req.headers)}`, 10, 60_000);
  const { as } = z
    .object({ as: z.enum(["freelancer", "client"]) })
    .strict()
    .parse(await readJson(req));
  return demoLogin(as);
});
