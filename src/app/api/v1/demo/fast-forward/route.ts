import { z } from "zod";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { fastForward } from "@/server/services/demo";

/** DEMO_MODE only: skip time (release_at / honor period), then run the tick (real PayPal calls). */
export const POST = route(async (req) => {
  const auth = await requireUser(req);
  const { dealId, what } = z
    .object({ dealId: z.uuid(), what: z.enum(["release", "renewal"]).default("release") })
    .strict()
    .parse(await readJson(req));
  return fastForward(auth, dealId, what);
});
