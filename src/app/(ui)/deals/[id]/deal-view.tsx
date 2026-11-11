"use client";

// Minimal deal page for Phase 4 testing (Phase 7 replaces it with the full design).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AppConfig, type DealDto, type MilestoneDto } from "@/sdk/browser";
import { PayPalHoldButtons } from "./paypal-buttons";

const STATUS_TEXT: Record<MilestoneDto["status"], string> = {
  draft: "Not started",
  awaiting_hold: "Waiting for the client to secure payment",
  held: "Secured — not charged yet",
  hold_at_risk: "Hold at risk",
  delivered: "Delivered — waiting for approval",
  changes_requested: "Changes requested",
  released: "Paid",
  voided: "Cancelled",
};

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
      .catch(() => alive && setConfig({ demoMode: false, paypalClientId: null }));
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
      <main className="mx-auto w-full max-w-2xl p-6">
        {message ? <p role="alert">{message.text}</p> : <p>Loading…</p>}
      </main>
    );
  }
  const isClient = deal.viewerRole === "client";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/deals" className="text-sm underline">
          ← All deals
        </Link>
        <h1 className="text-2xl font-semibold">{deal.title}</h1>
        <p className="text-sm text-neutral-700">
          {deal.total.formatted} · {deal.status} · you are the {deal.viewerRole}
        </p>
        {deal.estimates[isClient ? "client" : "freelancer"] && (
          <p className="text-sm text-neutral-700">
            ≈ {deal.estimates[isClient ? "client" : "freelancer"]!.amount.formatted} (
            {deal.estimates[isClient ? "client" : "freelancer"]!.note})
          </p>
        )}
      </header>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg p-3 text-sm ${message.kind === "error" ? "bg-[#FDF0EF] text-[#A3261A]" : "bg-[#E7F3EF] text-[#0B6E5B]"}`}
        >
          {message.text}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {deal.milestones.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {m.position + 1}. {m.title}
                </h2>
                <p className="text-sm">{STATUS_TEXT[m.status]}</p>
              </div>
              <strong>{m.amount.formatted}</strong>
            </div>

            <ul className="list-disc pl-5 text-sm">
              {m.todos.map((t) => (
                <li key={t.id}>{t.label}</li>
              ))}
            </ul>

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

            {/* Freelancer: deliver (files + AI check arrive in Phase 5) */}
            {!isClient && (m.status === "held" || m.status === "changes_requested") && (
              <button
                className={`${btn} bg-[#0B6E5B] text-white`}
                disabled={busy}
                onClick={() =>
                  act("Marked as delivered.", () =>
                    api.milestones.deliver(m.id, "Delivered from the Phase 4 test page"),
                  )
                }
              >
                Mark delivered
              </button>
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
    </main>
  );
}
