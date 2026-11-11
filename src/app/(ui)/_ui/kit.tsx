// Small UI kit: real <button>/<label>, 44 px targets, status always as text + colour.
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const variants = {
  primary: "bg-accent text-white hover:brightness-110",
  secondary: "border border-line bg-white text-ink hover:bg-ground",
  ghost: "text-ink hover:bg-ground",
  warn: "border border-warn bg-warn-bg text-warn hover:brightness-95",
  danger: "border border-error bg-error-bg text-error hover:brightness-95",
};
export type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton(props: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={props.href}
      className={`${base} ${variants[props.variant ?? "primary"]} ${props.className ?? ""}`}
    >
      {props.children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] border border-line bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader(props: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-sm text-ink-soft">{props.subtitle}</p>}
      </div>
      {props.actions && <div className="flex flex-wrap gap-2">{props.actions}</div>}
    </header>
  );
}

export function StatTile(props: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {props.label}
      </span>
      <span className="text-2xl font-semibold">{props.value}</span>
      {props.hint && <span className="text-xs text-ink-soft">{props.hint}</span>}
    </Card>
  );
}

export type Tone = "ok" | "info" | "warn" | "error" | "neutral";
const tones: Record<Tone, string> = {
  ok: "bg-accent-soft text-accent",
  info: "bg-[#EEF4FF] text-[#2E4BA8]",
  warn: "bg-warn-bg text-warn",
  error: "bg-error-bg text-error",
  neutral: "bg-ground text-ink-soft",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Banner({
  tone,
  title,
  children,
}: {
  tone: Exclude<Tone, "neutral">;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl p-3 text-sm ${tones[tone]}`}
    >
      {title && <strong className="block">{title}</strong>}
      {children}
    </div>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {props.label}
      {props.children}
      {props.hint && <span className="text-xs font-normal text-ink-soft">{props.hint}</span>}
    </label>
  );
}

export const inputClass = "min-h-11 rounded-xl border border-line px-3 text-base font-normal";

const DEAL_STATUS: Record<string, [string, Tone]> = {
  draft: ["Draft", "neutral"],
  shared: ["Shared", "info"],
  approved: ["Approved", "info"],
  active: ["Active", "ok"],
  completed: ["Completed", "ok"],
  cancelled: ["Cancelled", "neutral"],
};
export function DealStatus({ status }: { status: string }) {
  const [text, tone] = DEAL_STATUS[status] ?? [status, "neutral"];
  return <Pill tone={tone}>{text}</Pill>;
}

const MILESTONE_STATUS: Record<string, [string, Tone]> = {
  draft: ["Not started", "neutral"],
  awaiting_hold: ["Waiting to be secured", "warn"],
  held: ["Secured · not charged yet", "ok"],
  hold_at_risk: ["Hold at risk", "error"],
  delivered: ["Delivered · awaiting review", "info"],
  changes_requested: ["Changes requested", "warn"],
  released: ["Paid", "ok"],
  voided: ["Cancelled", "neutral"],
};
export function MilestoneStatus({ status, addonOffer }: { status: string; addonOffer?: boolean }) {
  if (addonOffer) return <Pill tone="info">Add-on offered</Pill>;
  const [text, tone] = MILESTONE_STATUS[status] ?? [status, "neutral"];
  return <Pill tone={tone}>{text}</Pill>;
}
