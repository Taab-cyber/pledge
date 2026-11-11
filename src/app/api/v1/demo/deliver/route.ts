import { z } from "zod";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { demoDeliver } from "@/server/services/demo";

/** DEMO_MODE only: the client asks the demo freelancer to deliver sample files now. */
export const POST = route(async (req) => {
  const auth = await requireUser(req);
  const { milestoneId, skipLast } = z
    .object({ milestoneId: z.uuid(), skipLast: z.boolean().default(false) })
    .strict()
    .parse(await readJson(req));
  return demoDeliver(auth, milestoneId, skipLast);
});
