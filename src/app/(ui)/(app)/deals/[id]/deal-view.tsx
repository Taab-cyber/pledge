"use client";

// Deal page for both sides: milestones, PayPal holds, deliveries, AI check, Deal Agent, demo controls.
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AppConfig, type DealDto } from "@/sdk/browser";
import { AgentFeed, MessageBox } from "./agent-feed";
import { DeliveryForm, DeliveryView, RequestChanges } from "./delivery-panel";
import { Banner, DealStatus, LinkButton, MilestoneStatus, PageHeader } from "../../../_ui/kit";
import { PayPalHoldButtons } from "./paypal-buttons";

const btn = "min-h-11 rounded-lg px-4 font-medium disabled:opacity-60";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function DealView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<DealDto | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setDeal(await api.deals.get(id));
    } catch (e) {
      if (e instanceof ApiError && e.code === "UNAUTHENTICATED")
        router.replace(`/login?next=/deals/${id}`);
      else
        setMessage({
          kind: "error",
          text: e instanceof Error ? e.message : "Could not load the deal.",
        });
    }
  }, [id, router]);

  useEffect(() => {
    let alive = true;
    api.deals
      .get(id)
      .then((d) => alive && setDeal(d))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === "UNAUTHENTICATED")
          router.replace(`/login?next=/deals/${id}`);
        else
          setMessage({
            kind: "error",
            text: e instanceof Error ? e.message : "Could not load the deal.",
          });
      });
    api
      .config()
      .then((c) => alive && setConfig(c))
      .catch(
        () =>
          alive &&
          setConfig({ demoMode: false, paypalClientId: null, countries: [], currencies: [] }),
      );
    return () => {
      alive = false;
    };
  }, [id, router]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: label });
    } catch (e) {
      const extra =
        e instanceof ApiError && e.details && typeof e.details === "object" && "paypal" in e.details
          ? ` (PayPal: ${JSON.stringify((e.details as { paypal: unknown }).paypal)})`
          : "";
      setMessage({
        kind: "error",
        text: `${e instanceof Error ? e.message : "Something went wrong."}${extra}`,
      });
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (!deal) {
    return (
      <div className="text-sm text-ink-soft">
        {message ? <Banner tone="error">{message.text}</Banner> : "Loading…"}
      </div>
    );
  }
  const isClient = deal.viewerRole === "client";

  return (
    <>
      <PageHeader
        title={deal.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {isClient ? "Your project" : `Client: ${deal.clientName}`} · {deal.total.formatted}
            <DealStatus status={deal.status} />
            {deal.estimates[isClient ? "client" : "freelancer"] && (
              <span>
                ≈ {deal.estimates[isClient ? "client" : "freelancer"]!.amount.formatted} (
                {deal.estimates[isClient ? "client" : "freelancer"]!.note})
              </span>
            )}
          </span>
        }
        actions={
          !isClient && (
            <LinkButton href={`/deals/${deal.id}/plan`} variant="secondary">
              {deal.status === "draft" || deal.status === "shared"
                ? "Edit plan & share"
                : "View plan"}
            </LinkButton>
          )
        }
      />

      {message && <Banner tone={message.kind === "error" ? "error" : "ok"}>{message.text}</Banner>}

      <ol className="flex flex-col gap-3">
        {deal.milestones.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {m.kind === "addon" ? "Add-on" : `${m.position + 1}.`} {m.title}
                </h2>
                <div className="mt-1">
                  <MilestoneStatus
                    status={m.status}
                    addonOffer={m.kind === "addon" && m.status === "draft"}
                  />
                </div>
              </div>
              <strong>{m.amount.formatted}</strong>
            </div>

            <ul className="flex flex-col gap-1 text-sm">
              {m.todos.map((t) => (
                <li key={t.id}>
                  {!isClient && ["held", "changes_requested", "delivered"].includes(m.status) ? (
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={(e) =>
                          act(e.target.checked ? "To-do ticked." : "To-do unticked.", () =>
                            api.todos.set(t.id, e.target.checked),
                          )
                        }
                      />
                      {t.label}
                    </label>
                  ) : (
                    <span>
                      {t.done ? "☑" : "☐"} {t.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <DeliveryView
              milestone={m}
              isClient={isClient}
              onError={(text) => setMessage({ kind: "error", text })}
            />

            {/* Client: answer an offered add-on (it then gets its own PayPal hold) */}
            {isClient && m.kind === "addon" && m.status === "draft" && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={`${btn} bg-[#0B6E5B] text-white`}
                  disabled={busy}
                  onClick={() =>
                    act("Add-on accepted. Secure it with PayPal below.", () =>
                      api.milestones.respondToAddon(m.id, true),
                    )
                  }
                >
                  Accept add-on
                </button>
                <button
                  className={`${btn} border border-neutral-400 text-neutral-800`}
                  disabled={busy}
                  onClick={() =>
                    act("Add-on declined.", () => api.milestones.respondToAddon(m.id, false))
                  }
                >
                  Decline
                </button>
              </div>
            )}

            {(m.payment.authorizationId || m.payment.captureId) && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-neutral-50 p-3 text-xs">
                {m.payment.authorizationId && (
                  <>
                    <dt>PayPal hold</dt>
                    <dd className="font-mono">{m.payment.authorizationId}</dd>
                    <dt>Hold valid until</dt>
                    <dd>{fmt(m.payment.holdExpiresAt)}</dd>
                  </>
                )}
                {m.payment.releaseAt && (
                  <>
                    <dt>Auto-release</dt>
                    <dd>{fmt(m.payment.releaseAt)}</dd>
                  </>
                )}
                {m.payment.payout && (
                  <>
                    <dt>Capture</dt>
                    <dd className="font-mono">
                      {m.payment.captureId} ({m.payment.captureStatus})
                    </dd>
                    <dt>Gross</dt>
                    <dd>{m.payment.payout.gross?.formatted ?? "—"}</dd>
                    <dt>PayPal fee</dt>
                    <dd>{m.payment.payout.fee?.formatted ?? "—"}</dd>
                    <dt>Net</dt>
                    <dd>{m.payment.payout.net?.formatted ?? "—"}</dd>
                    {m.payment.payout.received && (
                      <>
                        <dt>Freelancer receives</dt>
                        <dd>
                          {m.payment.payout.received.formatted}
                          {m.payment.payout.fxRate && ` (PayPal rate ${m.payment.payout.fxRate})`}
                        </dd>
                      </>
                    )}
                  </>
                )}
              </dl>
            )}

            {m.payment.lastError && (
              <p className="rounded-lg bg-[#FDF0EF] p-2 text-xs text-[#A3261A]">
                Last PayPal error ({m.payment.lastError.action}): {m.payment.lastError.message}
                {m.payment.lastError.issue && ` · ${m.payment.lastError.issue}`}
                {m.payment.lastError.debugId && ` · debug id ${m.payment.lastError.debugId}`}
              </p>
            )}

            {isClient && m.status === "hold_at_risk" && (
              <button
                className={`${btn} bg-[#0B6E5B] text-white`}
                disabled={busy}
                onClick={() =>
                  act("Old hold released. Secure the milestone again below.", () =>
                    api.milestones.resecure(m.id),
                  )
                }
              >
                Secure again with a new hold
              </button>
            )}

            {/* Client: secure with PayPal (hold, not charged yet) */}
            {isClient && m.status === "awaiting_hold" && config?.paypalClientId && (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  Secure {m.amount.formatted} with PayPal. This places a <strong>hold</strong>: you
                  are not charged until you approve the work.
                </p>
                <PayPalHoldButtons
                  clientId={config.paypalClientId}
                  currency={deal.currency}
                  createOrder={async () => (await api.milestones.createHold(m.id)).orderId}
                  onApprove={(orderId) =>
                    act("Payment secured. You haven't been charged yet.", () =>
                      api.milestones.confirmHold(m.id, orderId),
                    )
                  }
                  onCancel={() =>
                    setMessage({
                      kind: "error",
                      text: "PayPal window closed. Nothing was held; you can try again.",
                    })
                  }
                  onError={(text) => setMessage({ kind: "error", text })}
                />
              </div>
            )}
            {isClient && m.status === "awaiting_hold" && config && !config.paypalClientId && (
              <p className="text-sm text-[#8A4B00]">
                PayPal isn&apos;t configured on this server yet.
              </p>
            )}

            {/* Demo: let a judge playing the client have the freelancer deliver sample files */}
            {isClient && deal.demoMode && m.status === "held" && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-warn bg-warn-bg p-3 text-sm text-warn">
                <span className="w-full">
                  Demo: there&apos;s no real freelancer here, so you can make Riya deliver sample
                  files now.
                </span>
                <button
                  className={`${btn} border border-warn`}
                  disabled={busy}
                  onClick={() =>
                    act("Riya delivered. Review it below.", () => api.demo.deliver(m.id))
                  }
                >
                  Demo: freelancer delivers now
                </button>
                <button
                  className={`${btn} border border-warn`}
                  disabled={busy}
                  onClick={() =>
                    act("Riya delivered, but left one item out.", () =>
                      api.demo.deliver(m.id, true),
                    )
                  }
                >
                  Demo: deliver with one item missing
                </button>
              </div>
            )}

            {/* Freelancer: deliver with files + AI pre-check */}
            {!isClient && (m.status === "held" || m.status === "changes_requested") && (
              <DeliveryForm
                milestone={m}
                onDone={(text) => {
                  setMessage({ kind: "ok", text });
                  void load();
                }}
                onError={(text) => setMessage({ kind: "error", text })}
              />
            )}

            {/* Client: approve and pay (PayPal capture) */}
            {isClient && m.status === "delivered" && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={`${btn} bg-[#0B6E5B] text-white`}
                  disabled={busy}
                  onClick={() =>
                    act("Paid! PayPal released the money to the freelancer.", () =>
                      api.milestones.release(m.id),
                    )
                  }
                >
                  Approve and pay
                </button>
                {deal.demoMode && (
                  <button
                    className={`${btn} border border-[#8A4B00] text-[#8A4B00]`}
                    disabled={busy}
                    onClick={() =>
                      act("Simulated decline sent to PayPal.", () =>
                        api.milestones.release(m.id, { simulateDecline: true }),
                      )
                    }
                  >
                    Demo: simulate a declined payment
                  </button>
                )}
              </div>
            )}
            {isClient && m.status === "delivered" && (
              <RequestChanges
                milestone={m}
                onDone={(text) => {
                  setMessage({ kind: "ok", text });
                  void load();
                }}
                onError={(text) => setMessage({ kind: "error", text })}
              />
            )}

            {!isClient && ["held", "hold_at_risk", "awaiting_hold"].includes(m.status) && (
              <button
                className={`${btn} border border-neutral-400 text-neutral-800`}
                disabled={busy}
                onClick={() => act("Hold cancelled.", () => api.milestones.cancel(m.id))}
              >
                Cancel this milestone
              </button>
            )}
          </li>
        ))}
      </ol>

      {deal.demoMode && (
        <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#8A4B00] bg-[#FFF6E6] p-3 text-sm text-[#8A4B00]">
          <strong>Demo controls (time is simulated; PayPal calls are real)</strong>
          <div className="flex flex-wrap gap-2">
            <button
              className={`${btn} border border-[#8A4B00]`}
              disabled={busy}
              onClick={() =>
                act("Skipped 3 days: the auto-release ran and PayPal captured the payment.", () =>
                  api.demo.fastForward(deal.id, "release"),
                )
              }
            >
              Demo: skip 3 days
            </button>
            <button
              className={`${btn} border border-[#8A4B00]`}
              disabled={busy}
              onClick={() =>
                act(
                  "Skipped the 3-day honor period: the tick asked PayPal to renew the hold.",
                  () => api.demo.fastForward(deal.id, "renewal"),
                )
              }
            >
              Demo: test hold renewal
            </button>
          </div>
        </section>
      )}

      <AgentFeed deal={deal} run={act} />
      <MessageBox deal={deal} run={act} />
    </>
  );
}
