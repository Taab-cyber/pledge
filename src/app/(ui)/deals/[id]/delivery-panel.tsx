"use client";

import { useState } from "react";
import { api, uploadDeliveryFiles, type DeliveryCheckDto, type MilestoneDto } from "@/sdk/browser";

const STATUS_STYLE: Record<DeliveryCheckDto["verdict"], { text: string; cls: string }> = {
  met: { text: "Included", cls: "bg-[#E7F3EF] text-[#0B6E5B]" },
  missing: { text: "Missing", cls: "bg-[#FDF0EF] text-[#A3261A]" },
  unclear: { text: "Unclear", cls: "bg-[#FFF6E6] text-[#8A4B00]" },
};

const btn = "min-h-11 rounded-lg px-4 font-medium disabled:opacity-60";

export function CheckList({ check }: { check: DeliveryCheckDto }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <p className="text-sm">
        <strong>AI check:</strong> {check.summary}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {check.items.map((i) => (
          <li key={i.todo} className="flex items-start gap-2">
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[i.status].cls}`}
            >
              {STATUS_STYLE[i.status].text}
            </span>
            <span>
              {i.todo}
              <span className="block text-xs text-neutral-600">{i.reason}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        The AI checks that items are there, not whether you like them.
      </p>
    </div>
  );
}

/** Freelancer: upload files, run the AI pre-check, then send. */
export function DeliveryForm(props: {
  milestone: MilestoneDto;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [uploaded, setUploaded] = useState<Array<{ path: string; name: string }> | null>(null);
  const [check, setCheck] = useState<DeliveryCheckDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function ensureUploaded() {
    if (uploaded) return uploaded;
    const u = await uploadDeliveryFiles(props.milestone.id, files);
    setUploaded(u);
    return u;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3">
      <label className="flex flex-col gap-1 text-sm">
        Files (PNG, JPEG, WebP, SVG, PDF or ZIP · up to 10 · 20 MB each)
        <input
          type="file"
          multiple
          className="min-h-11 text-sm"
          onChange={(e) => {
            setFiles([...(e.target.files ?? [])]);
            setUploaded(null);
            setCheck(null);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note to the client
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded-lg border border-neutral-300 p-2 text-base text-neutral-900"
        />
      </label>
      {check && <CheckList check={check} />}
      <div className="flex flex-wrap gap-2">
        <button
          className={`${btn} border border-[#0B6E5B] text-[#0B6E5B]`}
          disabled={!!busy}
          onClick={() =>
            run("check", async () => {
              const u = await ensureUploaded();
              setCheck(
                (await api.milestones.checkDelivery(props.milestone.id, { note, files: u })).check,
              );
            })
          }
        >
          {busy === "check" ? "Checking…" : "Check with AI first"}
        </button>
        <button
          className={`${btn} bg-[#0B6E5B] text-white`}
          disabled={!!busy}
          onClick={() =>
            run("send", async () => {
              const u = await ensureUploaded();
              const res = await api.milestones.deliver(props.milestone.id, { note, files: u });
              props.onDone(
                res.aiCheck?.verdict === "missing"
                  ? "Delivered. The AI flagged missing items, so the client will see them."
                  : "Delivered to the client.",
              );
            })
          }
        >
          {busy === "send"
            ? "Sending…"
            : check?.verdict === "missing"
              ? "Send anyway"
              : "Send to client"}
        </button>
      </div>
    </div>
  );
}

/** Both sides: what was delivered. Client sees watermarked previews until payment. */
export function DeliveryView(props: {
  milestone: MilestoneDto;
  isClient: boolean;
  onError: (message: string) => void;
}) {
  const d = props.milestone.delivery;
  if (!d) return null;
  async function open(index: number) {
    try {
      const { url } = await api.milestones.fileUrl(props.milestone.id, index, "original");
      window.open(url, "_blank", "noopener");
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Couldn't open the file.");
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <strong>Delivery #{d.round}</strong> · {new Date(d.createdAt).toLocaleString()}
        {d.note && <span className="block text-neutral-700">“{d.note}”</span>}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {d.files.map((f) => (
          <li
            key={f.index}
            className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-2 text-xs"
          >
            {f.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
              <img
                src={f.previewUrl}
                alt={`Preview of ${f.name}`}
                className="aspect-square w-full rounded object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded bg-neutral-100">
                {f.mime.split("/")[1]?.toUpperCase()}
              </div>
            )}
            <span className="truncate" title={f.name}>
              {f.name}
            </span>
            {f.originalAvailable ? (
              <button
                className="min-h-11 rounded border border-neutral-300"
                onClick={() => open(f.index)}
              >
                Download original
              </button>
            ) : (
              <span className="text-neutral-500">
                {props.isClient ? "Original unlocks after payment" : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      {d.aiCheck && <CheckList check={d.aiCheck} />}
    </div>
  );
}

/** Client: ask for changes (uses a revision round). */
export function RequestChanges(props: {
  milestone: MilestoneDto;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const left = props.milestone.revisionsIncluded - props.milestone.revisionsUsed;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Ask for changes (
        {left > 0
          ? `${left} revision round${left === 1 ? "" : "s"} left`
          : "no included rounds left"}
        )
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-lg border border-neutral-300 p-2 text-base text-neutral-900"
        />
      </label>
      <button
        className={`${btn} border border-neutral-400 text-neutral-800`}
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.milestones.requestChanges(props.milestone.id, text);
            props.onDone(
              `Changes requested. ${r.revisionsLeft} round(s) left. Auto-release is paused.`,
            );
          } catch (e) {
            props.onError(e instanceof Error ? e.message : "Couldn't send the request.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Ask for changes
      </button>
    </div>
  );
}
