"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, supabaseBrowser } from "@/sdk/browser";

type Step = "email" | "code" | "password";

const input = "min-h-11 rounded-lg border border-neutral-300 px-3 text-base text-neutral-900";
const primary = "min-h-11 rounded-lg bg-[#0B6E5B] px-4 font-medium text-white disabled:opacity-60";

/** Where to go after signing in: ?next=/path (same-site paths only). */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) => setDemoMode(c.demoMode))
      .catch(() => setDemoMode(false));
  }, []);

  async function run(fn: () => Promise<{ error: { message: string } | null }>, onOk: () => void) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setError(error.message);
    onOk();
  }

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        supabaseBrowser().auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true },
        }),
      () => setStep("code"),
    );
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        supabaseBrowser().auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        }),
      () => router.push(nextPath()),
    );
  };

  const signInWithPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password }),
      () => router.push(nextPath()),
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Pledge</h1>

      {step === "email" && (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
          {demoMode && (
            <button
              type="button"
              onClick={() => setStep("password")}
              className="min-h-11 text-sm underline"
            >
              Demo account? Sign in with a password
            </button>
          )}
        </form>
      )}

      {step === "code" && (
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
              className={`${input} tracking-widest`}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
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

      {step === "password" && (
        <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
          <p className="rounded-lg bg-[#FFF6E6] p-3 text-sm text-[#8A4B00]">
            Demo accounts only. Real users sign in with an email code.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="min-h-11 text-sm underline"
          >
            Use an email code instead
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
