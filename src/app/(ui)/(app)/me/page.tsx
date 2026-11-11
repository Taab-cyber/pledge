"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, type AppConfig, type UpdateMeInput } from "@/sdk/browser";
import { useMe } from "../../_ui/app-shell";
import { Banner, Button, Card, Field, inputClass, PageHeader } from "../../_ui/kit";

export default function MePage() {
  const router = useRouter();
  const { me, refresh } = useMe();
  const p = me.profile;
  const [role, setRole] = useState<"freelancer" | "client" | null>(p.role);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v === "" ? undefined : v;
    };
    const body: UpdateMeInput = {
      full_name: get("full_name"),
      profession: get("profession"),
      country_code: get("country_code"),
    };
    if (!p.role && role) body.role = role;
    if ((p.role ?? role) === "freelancer") body.paypal_email = get("paypal_email");
    setBusy(true);
    try {
      const res = await api.me.update(JSON.parse(JSON.stringify(body)) as UpdateMeInput);
      await refresh();
      if (res.onboarded) router.push("/deals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const effectiveRole = p.role ?? role;
  return (
    <>
      <PageHeader
        title="Your profile"
        subtitle={`Signed in as ${me.user.email ?? "a demo account"}`}
      />
      <Card>
        <form onSubmit={save} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={!!p.role}>
            <legend className="mb-1 text-sm font-medium">
              I use Pledge as a… {p.role && <span className="text-ink-soft">(set once)</span>}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["freelancer", "client"] as const).map((r) => (
                <label
                  key={r}
                  className={`flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm ${effectiveRole === r ? "border-accent bg-accent-soft" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={effectiveRole === r}
                    onChange={() => setRole(r)}
                    required
                  />
                  <span>
                    <strong>{r === "freelancer" ? "Freelancer" : "Client"}</strong>
                    <span className="block text-xs text-ink-soft">
                      {r === "freelancer" ? "I send plans and get paid" : "I approve plans and pay"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <input
                name="full_name"
                required
                defaultValue={p.full_name ?? ""}
                className={inputClass}
                autoComplete="name"
              />
            </Field>
            <Field label="Profession">
              <input
                name="profession"
                defaultValue={p.profession ?? ""}
                className={inputClass}
                placeholder="e.g. Brand designer"
              />
            </Field>
            <Field label="Country">
              <select
                name="country_code"
                required
                defaultValue={p.country_code ?? ""}
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
            {effectiveRole === "freelancer" && (
              <Field
                label="PayPal email for payouts"
                hint="Clients pay this PayPal account directly (sandbox email for the demo)."
              >
                <input
                  name="paypal_email"
                  type="email"
                  required
                  defaultValue={p.paypal_email ?? ""}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
          {error && <Banner tone="error">{error}</Banner>}
          {me.onboarded && <Banner tone="ok">Your profile is complete.</Banner>}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
