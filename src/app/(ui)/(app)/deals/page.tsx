"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type DealList, type MoneyDto } from "@/sdk/browser";
import { useMe } from "../../_ui/app-shell";
import { Banner, Card, DealStatus, LinkButton, PageHeader, Pill, StatTile } from "../../_ui/kit";

/** Adds amounts per currency (deals can be in different currencies): "£520.00 · $100.00". */
function totalByCurrency(items: MoneyDto[]): string {
  const by = new Map<string, MoneyDto[]>();
  for (const m of items) if (m.minor > 0) by.set(m.currency, [...(by.get(m.currency) ?? []), m]);
  if (by.size === 0) return "—";
  return [...by.entries()]
    .map(([currency, list]) => {
      const minor = list.reduce((a, m) => a + m.minor, 0);
      const exp = currency === "JPY" ? 0 : 2;
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        minimumFractionDigits: exp,
        maximumFractionDigits: exp,
      }).format(minor / 10 ** exp);
    })
    .join(" · ");
}

export default function DealsPage() {
  const { me } = useMe();
  const [list, setList] = useState<DealList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoPlanUrl, setDemoPlanUrl] = useState<string | null>(null);
  const isClient = me.profile.role === "client";

  useEffect(() => {
    api.deals
      .list()
      .then(setList)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load deals."));
    api
      .config()
      .then((c) => setDemoPlanUrl(c.demoPlanUrl))
      .catch(() => setDemoPlanUrl(null));
  }, []);

  const deals = list?.deals ?? [];
  const waiting = deals.filter((d) => d.waitingOnYou);

  return (
    <>
      <PageHeader
        title={isClient ? "My projects" : "Dashboard"}
        subtitle={
          isClient
            ? "Everything you've agreed with freelancers, and what needs you."
            : "Your deals, the money secured for them, and what's next."
        }
        actions={!isClient && <LinkButton href="/deals/new">New deal</LinkButton>}
      />

      {error && <Banner tone="error">{error}</Banner>}
      {isClient && demoPlanUrl && (
        <Banner tone="info" title="Demo: Riya sent you a plan on WhatsApp">
          <a href={demoPlanUrl} className="font-semibold underline">
            Open the plan
          </a>{" "}
          to approve it, secure the first milestone with PayPal (sandbox), and review her delivery.
        </Banner>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={isClient ? "Secured (not charged yet)" : "Held for you"}
          value={totalByCurrency(deals.map((d) => d.held))}
          hint="PayPal holds, released when work is approved"
        />
        <StatTile
          label={isClient ? "Paid this month" : "Released this month"}
          value={totalByCurrency(deals.map((d) => d.releasedThisMonth))}
        />
        <StatTile
          label={isClient ? "Waiting on you" : "Waiting on clients"}
          value={String(
            isClient
              ? waiting.length
              : deals.filter(
                  (d) => !d.waitingOnYou && ["shared", "approved", "active"].includes(d.status),
                ).length,
          )}
          hint={isClient ? "Approvals, reviews and holds" : "Approvals, holds and reviews"}
        />
      </div>

      {!list && !error && <p className="text-sm text-ink-soft">Loading…</p>}
      {list && deals.length === 0 && (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="font-semibold">{isClient ? "No projects yet" : "No deals yet"}</h2>
          <p className="text-sm text-ink-soft">
            {isClient
              ? "When a freelancer sends you a Pledge link and you approve it, it shows up here."
              : "Drop in the chat where you agreed the job, and Pledge turns it into a secured plan."}
          </p>
          {!isClient && <LinkButton href="/deals/new">Create your first deal</LinkButton>}
        </Card>
      )}

      {deals.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">{isClient ? "Projects" : "Deals"}</caption>
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {isClient ? "Project" : "Deal"}
                </th>
                <th scope="col" className="px-4 py-3">
                  {isClient ? "Freelancer" : "Client"}
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Next step
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-ground">
                  <td className="px-4 py-3">
                    <Link
                      href={`/deals/${d.id}`}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {d.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{d.counterpartName}</td>
                  <td className="px-4 py-3">
                    <DealStatus status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    {d.nextStep &&
                      (d.waitingOnYou ? (
                        <Pill tone="warn">{d.nextStep}</Pill>
                      ) : (
                        <span className="text-ink-soft">{d.nextStep}</span>
                      ))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{d.total.formatted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
