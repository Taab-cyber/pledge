import { ReleaseInputSchema } from "@/sdk/schemas";
import { env } from "@/server/env";
import { requireUser } from "@/server/http/auth";
import { AppError } from "@/server/http/errors";
import { readJson, route } from "@/server/http/route";
import { releaseMilestone } from "@/server/services/payments";

/** Client: approve the delivery → PayPal capture → money goes to the freelancer. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const auth = await requireUser(req);
  const hasBody = (req.headers.get("content-length") ?? "0") !== "0";
  const input = ReleaseInputSchema.parse(hasBody ? await readJson(req) : {});
  if (input.simulateDecline && !env().DEMO_MODE) {
    throw new AppError("FORBIDDEN", "Simulated declines are only available in demo mode.");
  }
  return releaseMilestone({ kind: "client", auth }, params.id, {
    simulate: input.simulateDecline ? { mockApplicationCode: "INSTRUMENT_DECLINED" } : undefined,
  });
});
