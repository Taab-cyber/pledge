import { z } from "zod";
import { requireUser } from "@/server/http/auth";
import { readJson, route } from "@/server/http/route";
import { refundMilestone } from "@/server/services/payments";

/** DEMO_MODE only: refund a paid milestone (freelancer of that deal). */
export const POST = route(async (req) => {
  const auth = await requireUser(req);
  const { milestoneId } = z
    .object({ milestoneId: z.uuid() })
    .strict()
    .parse(await readJson(req));
  return refundMilestone(auth, milestoneId);
});
