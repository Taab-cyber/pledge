"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, supabaseBrowser, type PublicPlan } from "@/sdk/browser";
import { Banner, Button, Card, inputClass } from "../../_ui/kit";

export function PublicPlanView() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [sent, setSent] = useState<string[] | null>(null);

  useEffect(() => {
    api.publicPlans
      .get(token)
      .then(setPlan)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "This link isn't valid."));
  }, [token]);

  async function approve() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const { data } = await Promise.race([
      supabaseBrowser().auth.getSession(),
      new Promise<{ data: { session: null } }>((r) =>
        setTimeout(() => r({ data: { session: null } }), 8_000),
      ),
    ]);
    if (!data.session) {
      router.push(`/login?next=${encodeURIComponent(`/p/${token}`)}`);
      return;
    }
    try {
      const r = await api.publicPlans.approve(token, plan.version);
      router.push(`/deals/${r.dealId}`);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "PLAN_VERSION_CHANGED") {
        setPlan(await api.publicPlans.get(token).catch(() => plan));
        setConsent(false);
      }
      setError(e instanceof Error ? e.message : "Couldn't approve the plan.");
    }
  }

  async function suggest() {
    setBusy(true);
    try {
      const r = await api.publicPlans.suggestChange(token, suggestion);
      setSent(r.changes);
      setSuggestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your suggestion.");
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <Brand />
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <p className="text-sm text-ink-soft">Loading the plan…</p>
        )}
      </main>
    );
  }

  const f = plan.freelancer;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-8">
      <Brand />
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-soft">
          {f.name}
          {f.profession ? `, ${f.profession}` : ""} sent {plan.clientName} a plan · version{" "}
          {plan.version}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{plan.title}</h1>
        {plan.summary && <p className="text-ink-soft">{plan.summary}</p>}
        <p className="mt-2 text-2xl font-semibold">{plan.total.formatted}</p>
      </header>

      {plan.state === "being_updated" && (
        <Banner tone="warn" title="The freelancer is updating this plan">
          You&apos;ll get a new link when it&apos;s ready. Nothing can be approved right now.
        </Banner>
      )}
      {plan.state === "approved" && (
        <Banner tone="ok" title="This plan is approved">
          <Link href="/deals" className="underline">
            Open your projects
          </Link>{" "}
          to secure and review milestones.
        </Banner>
      )}
      {plan.state === "closed" && <Banner tone="info">This deal was closed.</Banner>}

      <ol className="flex flex-col gap-3">
        {plan.milestones.map((m) => (
          <li key={m.position}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">
                  {m.position + 1}. {m.title}
                </h2>
                <strong>{m.amount.formatted}</strong>
              </div>
              <p className="text-xs text-ink-soft">
                {m.dueInDays ? `Due ${m.dueInDays} days after you secure it · ` : ""}
                {m.revisionsIncluded} revision round{m.revisionsIncluded === 1 ? "" : "s"} included
              </p>
              <ul className="list-disc pl-5 text-sm">
                {m.todos.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-2 bg-accent-soft">
        <h2 className="font-semibold">How paying works</h2>
        <ol className="list-decimal pl-5 text-sm">
          <li>
            You secure one milestone at a time with PayPal. It&apos;s a hold: you are not charged
            yet.
          </li>
          <li>
            {f.name} delivers. You see watermarked previews and an AI check of what&apos;s included.
          </li>
          <li>
            You approve and PayPal pays {f.name} directly, or you ask for changes (that pauses the
            timer).
          </li>
          <li>
            If you don&apos;t respond within {plan.autoReleaseHours} hours of a delivery, the
            payment is released automatically (only with your consent below).
          </li>
        </ol>
        <p className="text-xs text-ink-soft">
          Pledge never holds your money. PayPal handles every payment.
        </p>
      </Card>

      {plan.state === "open" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Approve this plan</h2>
          <pre className="whitespace-pre-wrap rounded-xl bg-ground p-3 font-sans text-xs text-ink">
            {plan.consentText}
          </pre>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I agree that payment for a delivered milestone is released automatically if I don&apos;t
            respond within {plan.autoReleaseHours} hours.
          </label>
          <Button disabled={!consent || busy} onClick={approve}>
            {busy ? "Approving…" : "Approve and continue"}
          </Button>
          <p className="text-xs text-ink-soft">
            You&apos;ll sign in with your email (we send a code) before approving.
          </p>
        </Card>
      )}

      {(plan.state === "open" || plan.state === "being_updated") && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Suggest a change</h2>
          <textarea
            rows={3}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="e.g. Could the brand kit come before the final logo?"
            className={`${inputClass} py-2`}
            aria-label="Your suggestion"
          />
          <Button variant="secondary" disabled={busy || !suggestion.trim()} onClick={suggest}>
            Send suggestion
          </Button>
          {sent && (
            <Banner tone="ok" title={`Sent to ${f.name}`}>
              {sent.length > 0 && (
                <ul className="list-disc pl-5">
                  {sent.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </Banner>
          )}
        </Card>
      )}

      {error && <Banner tone="error">{error}</Banner>}
    </main>
  );
}

function Brand() {
  return (
    <Link href="/" className="text-xl font-bold text-accent">
      Pledge
    </Link>
  );
}
