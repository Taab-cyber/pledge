"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, type DealDto, type ShareResult } from "@/sdk/browser";
import {
  Banner,
  Button,
  Card,
  DealStatus,
  Field,
  inputClass,
  PageHeader,
} from "../../../../_ui/kit";

interface EditMilestone {
  title: string;
  amountMajor: string;
  dueInDays: number;
  revisionsIncluded: number;
  todos: string[];
}

const expOf = (currency: string) => (currency === "JPY" ? 0 : 2);

/** "12.50" → 1250 minor units (null if not a valid amount for this currency). */
function toMinor(value: string, currency: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const exp = expOf(currency);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > exp) return null;
  return Number(m[1]) * 10 ** exp + Number((frac.padEnd(exp, "0") || "0").slice(0, exp));
}
const toMajor = (minor: number, currency: string) =>
  (minor / 10 ** expOf(currency)).toFixed(expOf(currency));
const fmt = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: expOf(currency),
    maximumFractionDigits: expOf(currency),
  }).format(minor / 10 ** expOf(currency));

export function PlanEditor() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [deal, setDeal] = useState<DealDto | null>(null);
  const [rows, setRows] = useState<EditMilestone[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(search.get("error"));
  const [share, setShare] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);

  function adopt(d: DealDto) {
    setDeal(d);
    setRows(
      d.milestones
        .filter((m) => m.kind === "milestone")
        .map((m) => ({
          title: m.title,
          amountMajor: toMajor(m.amount.minor, d.currency),
          dueInDays: m.dueInDays ?? 7,
          revisionsIncluded: m.revisionsIncluded,
          todos: m.todos.map((t) => t.label),
        })),
    );
    setDirty(false);
  }

  useEffect(() => {
    api.deals
      .get(id)
      .then(adopt)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the deal."));
  }, [id]);

  const currency = deal?.currency ?? "USD";
  const totalMinor = deal?.total.minor ?? 0;
  const amounts = rows.map((r) => toMinor(r.amountMajor, currency));
  const sumMinor = amounts.reduce<number>((a, v) => a + (v ?? 0), 0);
  const diff = totalMinor - sumMinor;
  const invalid =
    amounts.some((a) => a === null || a < 1) ||
    rows.some((r) => !r.title.trim() || r.todos.some((t) => !t.trim()) || r.todos.length === 0);
  const sumOk = diff === 0 && !invalid && rows.length > 0;
  const editable =
    deal?.viewerRole === "freelancer" && (deal.status === "draft" || deal.status === "shared");
  const unit = 10 ** expOf(currency);

  const update = (i: number, patch: Partial<EditMilestone>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
    setShare(null);
  };
  const nudge = (i: number, delta: number) => {
    const cur = amounts[i] ?? 0;
    update(i, { amountMajor: toMajor(Math.max(unit, cur + delta), currency) });
  };

  const gaps = deal?.planMeta?.gaps ?? [];
  const suggestions = useMemo(
    () => deal?.changeRequests.filter((c) => c.kind === "suggestion") ?? [],
    [deal],
  );

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      adopt(await api.deals.editPlan(id, { milestones: rows }));
    });

  if (!deal)
    return error ? (
      <Banner tone="error">{error}</Banner>
    ) : (
      <p className="text-sm text-ink-soft">Loading the plan…</p>
    );

  if (share) {
    return (
      <>
        <PageHeader
          title="Send it to your client"
          subtitle={`Plan version ${share.version} is ready.`}
        />
        <Card className="flex flex-col gap-4">
          <div className="max-w-md self-start rounded-2xl rounded-tl-sm bg-[#D9FDD3] p-3 text-sm text-ink shadow-sm">
            {share.message}
          </div>
          <div className="flex flex-wrap gap-2">
            {share.whatsappUrl && (
              <a
                href={share.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white"
              >
                Open WhatsApp
              </a>
            )}
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(share.shareUrl);
                setCopied(true);
              }}
            >
              {copied ? "Link copied" : "Copy link"}
            </Button>
            <a
              href={share.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold underline"
            >
              See what your client sees
            </a>
          </div>
          <p className="text-xs text-ink-soft">
            Each share creates a new link; older links stop working. If you edit the plan later,
            share again.
          </p>
        </Card>
        <Link href={`/deals/${id}`} className="text-sm underline">
          Go to the deal
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={deal.title || "Your plan"}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {deal.clientName} · {deal.total.formatted} <DealStatus status={deal.status} />
          </span>
        }
        actions={
          <Link
            href={`/deals/${id}`}
            className="inline-flex min-h-11 items-center text-sm underline"
          >
            Deal page
          </Link>
        }
      />

      {error && <Banner tone="error">{error}</Banner>}
      {!editable && (
        <Banner tone="info">
          This plan was approved by the client, so it can&apos;t be edited any more.
        </Banner>
      )}
      {deal.status === "shared" && editable && (
        <Banner tone="info">
          Your client has the link. Saving changes takes it back to draft until you share again.
        </Banner>
      )}
      {deal.planMeta?.priceMismatch && (
        <Banner tone="warn" title="The chat mentions a different price">
          The chat says {deal.planMeta.priceInChat.amount}{" "}
          {deal.planMeta.priceInChat.currency ?? ""}; you entered {deal.total.formatted}. Pledge
          uses your total. Check it before sharing.
        </Banner>
      )}
      {gaps.length > 0 && (
        <Card className="flex flex-col gap-2 border-warn bg-warn-bg">
          <h2 className="font-semibold text-warn">Things the chat didn&apos;t settle</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {gaps.map((g) => (
              <li key={g.question}>
                <strong>{g.question}</strong>{" "}
                <span className="text-ink-soft">Suggested: {g.suggestedDefault}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            Add the answers as to-dos so they&apos;re part of what your client approves.
          </p>
        </Card>
      )}
      {suggestions.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Your client suggested changes</h2>
          {suggestions.map((s) => (
            <div key={s.id} className="text-sm">
              <p>“{s.text}”</p>
              {s.aiChanges && (
                <ul className="list-disc pl-5 text-xs text-ink-soft">
                  {s.aiChanges.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Card>
      )}

      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const share =
            amounts[i] && totalMinor ? Math.min(100, (amounts[i]! / totalMinor) * 100) : 0;
          return (
            <li key={i}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={`Milestone ${i + 1}`}>
                    <input
                      value={r.title}
                      disabled={!editable}
                      onChange={(e) => update(i, { title: e.target.value })}
                      className={`${inputClass} w-72 max-w-full`}
                    />
                  </Field>
                  <Field label={`Amount (${currency})`}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!editable}
                        aria-label={`Decrease milestone ${i + 1}`}
                        onClick={() => nudge(i, -unit)}
                      >
                        −
                      </Button>
                      <input
                        inputMode="decimal"
                        value={r.amountMajor}
                        disabled={!editable}
                        onChange={(e) => update(i, { amountMajor: e.target.value })}
                        className={`${inputClass} w-28 text-right`}
                        aria-invalid={amounts[i] === null}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!editable}
                        aria-label={`Increase milestone ${i + 1}`}
                        onClick={() => nudge(i, unit)}
                      >
                        +
                      </Button>
                    </div>
                  </Field>
                  <Field label="Days to finish">
                    <input
                      type="number"
                      min={1}
                      max={21}
                      value={r.dueInDays}
                      disabled={!editable}
                      onChange={(e) => update(i, { dueInDays: Number(e.target.value) })}
                      className={`${inputClass} w-24`}
                    />
                  </Field>
                  <Field label="Revisions">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={r.revisionsIncluded}
                      disabled={!editable}
                      onChange={(e) => update(i, { revisionsIncluded: Number(e.target.value) })}
                      className={`${inputClass} w-24`}
                    />
                  </Field>
                </div>
                <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-ground">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                </div>
                <p className="text-xs text-ink-soft">{Math.round(share)}% of the deal</p>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">
                    To-dos (what the client checks against)
                  </legend>
                  {r.todos.map((t, j) => (
                    <div key={j} className="flex gap-2">
                      <input
                        aria-label={`To-do ${j + 1} of milestone ${i + 1}`}
                        value={t}
                        disabled={!editable}
                        onChange={(e) =>
                          update(i, {
                            todos: r.todos.map((x, k) => (k === j ? e.target.value : x)),
                          })
                        }
                        className={`${inputClass} flex-1`}
                      />
                      {editable && (
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Remove to-do ${j + 1}`}
                          onClick={() => update(i, { todos: r.todos.filter((_, k) => k !== j) })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => update(i, { todos: [...r.todos, ""] })}
                      >
                        Add to-do
                      </Button>
                      {rows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setRows((rs) => rs.filter((_, k) => k !== i));
                            setDirty(true);
                          }}
                        >
                          Remove milestone
                        </Button>
                      )}
                    </div>
                  )}
                </fieldset>
              </Card>
            </li>
          );
        })}
      </ol>

      {editable && rows.length < 8 && (
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRows((rs) => [
                ...rs,
                {
                  title: "New milestone",
                  amountMajor: toMajor(unit, currency),
                  dueInDays: 7,
                  revisionsIncluded: 1,
                  todos: [""],
                },
              ]);
              setDirty(true);
            }}
          >
            Add milestone
          </Button>
        </div>
      )}

      <Card
        className={`sticky bottom-3 flex flex-col gap-3 ${sumOk ? "border-accent" : "border-warn"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Allocated <strong>{fmt(sumMinor, currency)}</strong> of{" "}
            <strong>{deal.total.formatted}</strong>
          </span>
          {sumOk ? (
            <span className="font-semibold text-accent">Adds up exactly</span>
          ) : diff !== 0 ? (
            <span className="font-semibold text-warn">
              {diff > 0
                ? `${fmt(diff, currency)} not allocated yet`
                : `${fmt(-diff, currency)} over the total`}
            </span>
          ) : (
            <span className="font-semibold text-warn">Fill in every title, amount and to-do</span>
          )}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {diff !== 0 && rows.length > 0 && (amounts[rows.length - 1] ?? 0) + diff >= 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  update(rows.length - 1, {
                    amountMajor: toMajor((amounts[rows.length - 1] ?? 0) + diff, currency),
                  })
                }
              >
                Put the difference on the last milestone
              </Button>
            )}
            <Button
              type="button"
              variant={dirty ? "primary" : "secondary"}
              disabled={!!busy || !dirty}
              onClick={save}
            >
              {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
            <Button
              type="button"
              disabled={!!busy || dirty || !sumOk || !deal.canShare}
              title={
                dirty
                  ? "Save your changes first"
                  : !sumOk
                    ? "Amounts must add up exactly to the total"
                    : undefined
              }
              onClick={() => run("share", async () => setShare(await api.deals.share(id)))}
            >
              {busy === "share" ? "Creating link…" : "Create WhatsApp link"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!!busy}
              onClick={() => run("ai", async () => adopt(await api.deals.buildPlan(id)))}
            >
              {busy === "ai" ? "Rebuilding…" : "Rebuild with AI"}
            </Button>
          </div>
        )}
        {editable && (dirty || !sumOk) && (
          <p className="text-xs text-ink-soft">
            The WhatsApp link unlocks when the plan is saved and adds up exactly.
          </p>
        )}
      </Card>
    </>
  );
}
