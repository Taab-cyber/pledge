"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, type AppConfig, type CreateDealInput } from "@/sdk/browser";
import { Banner, Button, Card, Field, inputClass, PageHeader } from "../../../_ui/kit";

type Mode = "screenshots" | "text";

export default function NewDealPage() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mode, setMode] = useState<Mode>("screenshots");
  const [files, setFiles] = useState<File[]>([]);
  const [chatText, setChatText] = useState("");
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [total, setTotal] = useState("");
  const [title, setTitle] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const countryInfo = config?.countries.find((c) => c.code === country);

  function pickCountry(code: string) {
    setCountry(code);
    const c = config?.countries.find((x) => x.code === code);
    if (c) setCurrency(c.currency);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: CreateDealInput = {
      clientName,
      clientWhatsapp: whatsapp,
      clientCountry: country,
      currency: currency as CreateDealInput["currency"],
      totalMajor: total,
      ...(title.trim() ? { title } : {}),
      ...(mode === "text" && chatText.trim() ? { chatText } : {}),
    };
    try {
      setStep("Saving the deal…");
      const deal = await api.deals.create(input, mode === "screenshots" ? files : []);
      setStep("The AI is reading the chat and building your plan…");
      try {
        await api.deals.buildPlan(deal.id);
        router.push(`/deals/${deal.id}/plan`);
      } catch (err) {
        router.push(
          `/deals/${deal.id}/plan?error=${encodeURIComponent(err instanceof Error ? err.message : "The AI couldn't build the plan.")}`,
        );
      }
    } catch (err) {
      setStep(null);
      setError(err instanceof Error ? err.message : "Couldn't create the deal.");
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`min-h-11 flex-1 rounded-xl text-sm font-semibold ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="New deal"
        subtitle="Drop in the chat where you agreed the job. Pledge turns it into milestones your client can secure with PayPal."
      />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div
            role="tablist"
            aria-label="How to add the agreement"
            className="flex gap-1 rounded-2xl bg-ground p-1"
          >
            {tab("screenshots", "Chat screenshots")}
            {tab("text", "Type the details")}
          </div>
          {mode === "screenshots" ? (
            <Field
              label="Screenshots (PNG, JPEG or WebP · up to 8)"
              hint="WhatsApp, Instagram or email: anything that shows what you agreed."
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 8))}
                className="min-h-11 text-sm font-normal"
              />
            </Field>
          ) : (
            <Field
              label="What did you agree?"
              hint="Paste the chat or describe the deliverables, timing and revisions."
            >
              <textarea
                rows={6}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                className={`${inputClass} py-2`}
              />
            </Field>
          )}
          {mode === "screenshots" && files.length > 0 && (
            <p className="text-xs text-ink-soft">{files.map((f) => f.name).join(", ")}</p>
          )}
        </Card>

        <Card className="grid gap-4 md:grid-cols-2">
          <Field label="Client name">
            <input
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          <Field label="Client WhatsApp number" hint="With country code, e.g. +44 7700 900123">
            <input
              required
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Client country">
            <select
              required
              value={country}
              onChange={(e) => pickCountry(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a country
              </option>
              {config?.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deal currency">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {(config?.currencies ?? ["USD"]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {countryInfo?.reason && (
            <div className="md:col-span-2">
              <Banner tone="info">{countryInfo.reason}</Banner>
            </div>
          )}
          <Field
            label={`Total agreed (${currency})`}
            hint="Between 5 and 10,000. The AI never changes this."
          >
            <input
              required
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={inputClass}
              placeholder="400"
            />
          </Field>
          <Field label="Title (optional)" hint="The AI suggests one if you leave this empty.">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </Field>
        </Card>

        {error && <Banner tone="error">{error}</Banner>}
        {step && <Banner tone="info">{step}</Banner>}
        <div>
          <Button type="submit" disabled={!!step}>
            {step ? "Working…" : "Build my plan with AI"}
          </Button>
        </div>
      </form>
    </>
  );
}
