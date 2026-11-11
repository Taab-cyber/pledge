"use client";

import { useState } from "react";
import { api, type AgentActionDto, type DealDto } from "@/sdk/browser";

const btn = "min-h-11 rounded-lg px-4 font-medium disabled:opacity-60";

/** Deal Agent feed: what it noticed, what it wants to do, and the buttons to act on it. */
export function AgentFeed(props: {
  deal: DealDto;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const items = props.deal.agentActions;
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Deal Agent</h2>
      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <AgentCard key={a.id} action={a} deal={props.deal} run={props.run} />
        ))}
      </ul>
    </section>
  );
}

function AgentCard(props: {
  action: AgentActionDto;
  deal: DealDto;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const a = props.action;
  const addon = (
    a.detail as {
      addon?: { title: string; todos: string[]; amountMinor: number; dueInDays: number };
    }
  ).addon;
  const [amount, setAmount] = useState(() =>
    addon
      ? (addon.amountMinor / (props.deal.currency === "JPY" ? 1 : 100)).toFixed(
          props.deal.currency === "JPY" ? 0 : 2,
        )
      : "",
  );
  const open = a.status === "proposed";
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-[#0B6E5B]/30 bg-[#E7F3EF] p-3 text-sm text-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <strong>{a.title}</strong>
        <span className="text-xs">{a.status.replace("_", " ")}</span>
      </div>
      {a.noticed && <p>Noticed: {a.noticed}</p>}
      {a.wants && <p>Wants to: {a.wants}</p>}

      {open && a.kind === "propose_addon" && addon && props.deal.viewerRole === "freelancer" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Price ({props.deal.currency})
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="min-h-11 w-28 rounded-lg border border-neutral-300 px-2 text-base"
            />
          </label>
          <button
            className={`${btn} bg-[#0B6E5B] text-white`}
            onClick={() =>
              props.run("Add-on sent to the client.", () =>
                api.deals.proposeAddon(props.deal.id, {
                  title: addon.title,
                  todos: addon.todos,
                  amountMajor: amount,
                  dueInDays: addon.dueInDays,
                  actionId: a.id,
                }),
              )
            }
          >
            Send add-on
          </button>
        </div>
      )}
    </li>
  );
}

/** Client: send a request; the scope guard says whether it's already covered or extra work. */
export function MessageBox(props: {
  deal: DealDto;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  if (props.deal.viewerRole !== "client" || !["approved", "active"].includes(props.deal.status))
    return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Message the freelancer</h2>
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Could you also make some Instagram templates?"
        className="rounded-lg border border-neutral-300 p-2 text-base text-neutral-900"
      />
      <button
        className={`${btn} border border-neutral-400 text-neutral-800`}
        disabled={!text.trim()}
        onClick={() =>
          props.run("Message sent.", async () => {
            const r = await api.deals.message(props.deal.id, text);
            setText("");
            return r;
          })
        }
      >
        Send
      </button>
      <MessageList deal={props.deal} />
    </section>
  );
}

export function MessageList({ deal }: { deal: DealDto }) {
  const messages = deal.changeRequests.filter((c) => c.kind !== "suggestion");
  if (messages.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {messages.map((m) => (
        <li key={m.id} className="rounded-lg bg-neutral-50 p-2 text-neutral-900">
          <span className="text-xs text-neutral-600">
            {m.kind === "revision" ? "Change request" : "Message"} ·{" "}
            {new Date(m.createdAt).toLocaleString()}
          </span>
          <span className="block">“{m.text}”</span>
          {m.scope && (
            <span
              className={`block text-xs ${m.scope.inScope ? "text-[#0B6E5B]" : "text-[#8A4B00]"}`}
            >
              {m.scope.inScope ? "In scope" : "Extra work"}: {m.scope.reason}
            </span>
          )}
          {m.aiChanges && (
            <ul className="list-disc pl-5 text-xs">
              {m.aiChanges.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
