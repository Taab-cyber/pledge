"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, supabaseBrowser, type MeResponse, type UpdateMeInput } from "@/sdk/browser";

const input = "min-h-11 rounded-lg border border-neutral-300 px-3 text-base text-neutral-900";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.me
      .get()
      .then(setMe)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === "UNAUTHENTICATED") router.replace("/login");
        else setError(e instanceof Error ? e.message : "Could not load your profile.");
      });
  }, [router]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
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
    const role = (get("role") ?? me?.profile.role ?? undefined) as UpdateMeInput["role"];
    if (!me?.profile.role && role) body.role = role;
    if (role === "freelancer") body.paypal_email = get("paypal_email");
    try {
      setMe(await api.me.update(JSON.parse(JSON.stringify(body)) as UpdateMeInput));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-md p-6">
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  const p = me.profile;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <button onClick={signOut} className="min-h-11 text-sm underline">
          Sign out
        </button>
      </header>

      <p className="text-sm">
        Signed in as <strong>{me.user.email}</strong>
        {" · "}
        {me.onboarded ? "Profile complete" : "Profile incomplete"}
      </p>

      <form onSubmit={save} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2" disabled={!!p.role}>
          <legend className="mb-1 text-sm">I am a… {p.role && "(set once, can't change)"}</legend>
          {(["freelancer", "client"] as const).map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="role" value={r} defaultChecked={p.role === r} required />
              {r === "freelancer" ? "Freelancer" : "Client"}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input name="full_name" defaultValue={p.full_name ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Profession
          <input name="profession" defaultValue={p.profession ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country (2-letter code, e.g. IN, GB, US)
          <input
            name="country_code"
            maxLength={2}
            defaultValue={p.country_code ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          PayPal email for payouts (freelancers)
          <input
            name="paypal_email"
            type="email"
            defaultValue={p.paypal_email ?? ""}
            className={input}
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-[#0B6E5B] px-4 font-medium text-white"
        >
          Save
        </button>
      </form>

      {saved && <p className="rounded-lg bg-[#E7F3EF] p-3 text-sm text-[#0B6E5B]">Saved.</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-[#FDF0EF] p-3 text-sm text-[#A3261A]">
          {error}
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer">Raw /api/v1/me response</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(me, null, 2)}</pre>
      </details>
    </main>
  );
}
