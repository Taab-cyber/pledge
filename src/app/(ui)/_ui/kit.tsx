// Small UI kit: real <button>/<label>, 44 px targets, status always as text + colour.
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const variants = {
  primary: "bg-accent text-white hover:brightness-110 shadow-sm",
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
    <section
      className={`rounded-xl border border-line bg-card p-5 shadow-sm ${className}`}
      style={{ boxShadow: "0 2px 9px rgba(28,66,101,.04)" }}
    >
      {children}
    </section>
  );
}

export function PageHeader(props: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "#172b4d", letterSpacing: "-0.8px" }}
        >
          {props.title}
        </h1>
        {props.subtitle && (
          <p className="mt-1 text-sm" style={{ color: "#6d7f95" }}>
            {props.subtitle}
          </p>
        )}
      </div>
      {props.actions && <div className="flex flex-wrap gap-2">{props.actions}</div>}
    </header>
  );
}

export function StatTile(props: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4"
      style={{ boxShadow: "0 2px 8px rgba(24,66,105,.025)" }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#7c8ea2" }}>
        {props.label}
      </span>
      <span className="text-2xl font-bold" style={{ color: "#172b4d" }}>
        {props.value}
      </span>
      {props.hint && (
        <span className="text-xs" style={{ color: "#91a0b1" }}>
          {props.hint}
        </span>
      )}
    </div>
  );
}

export type Tone = "ok" | "info" | "warn" | "error" | "neutral";
const tones: Record<Tone, string> = {
  ok: "bg-[#e8f7ef] text-[#168653]",
  info: "bg-accent-soft text-[#087fbd]",
  warn: "bg-warn-bg text-warn",
  error: "bg-error-bg text-error",
  neutral: "bg-ground text-ink-soft",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${tones[tone]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-sm bg-current" />
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
    <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: "#587087" }}>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#587087" }}>
        {props.label}
      </span>
      {props.children}
      {props.hint && (
        <span className="text-xs font-normal" style={{ color: "#8a958c", lineHeight: 1.6 }}>
          {props.hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "min-h-11 rounded-lg border border-line px-3 text-sm font-normal focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";

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
