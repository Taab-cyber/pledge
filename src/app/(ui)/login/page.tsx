"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/sdk/browser";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/me");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Pledge</h1>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 rounded-lg border border-neutral-300 px-3 text-base text-neutral-900"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-[#0B6E5B] px-4 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm">We sent a code to {email}.</p>
          <label className="flex flex-col gap-1 text-sm">
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-11 rounded-lg border border-neutral-300 px-3 text-base tracking-widest text-neutral-900"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-[#0B6E5B] px-4 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="min-h-11 text-sm underline"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-[#FDF0EF] p-3 text-sm text-[#A3261A]">
          {error}
        </p>
      )}
    </main>
  );
}
