"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, supabaseBrowser } from "@/sdk/browser";
import { Banner, Button, Card, Field, inputClass } from "../_ui/kit";

type Step = "email" | "code" | "password";

/** Where to go after signing in: ?next=/path (same-site paths only). */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/deals";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) => setDemoMode(c.demoMode))
      .catch(() => setDemoMode(false));
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run("code", async () => {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("code");
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run("verify", async () => {
      const { error } = await supabaseBrowser().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      router.push(nextPath());
    });
  };

  const withPassword = (e: FormEvent) => {
    e.preventDefault();
    void run("password", async () => {
      const { error } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.push(nextPath());
    });
  };

  /** Judges: the server signs in to the seeded demo account and hands back a session. */
  const tryAs = (as: "freelancer" | "client") =>
    run(as, async () => {
      const s = await api.demo.login(as);
      const { error } = await supabaseBrowser().auth.setSession({
        access_token: s.accessToken,
        refresh_token: s.refreshToken,
      });
      if (error) throw error;
      router.push(nextPath());
    });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-4">
      <Link href="/" className="text-2xl font-bold text-accent">
        Pledge
      </Link>

      {demoMode && (
        <Card className="flex flex-col gap-3 border-accent">
          <h2 className="font-semibold">Judging Pledge? Skip sign-up</h2>
          <p className="text-sm text-ink-soft">
            Use the demo accounts: Riya, a brand designer in India, and Daniel, her client in the
            UK. Payments run on the PayPal sandbox (no real money).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button disabled={!!busy} onClick={() => tryAs("client")}>
              {busy === "client" ? "Signing in…" : "Try as client"}
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => tryAs("freelancer")}>
              {busy === "freelancer" ? "Signing in…" : "Try as freelancer"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Sign in</h1>

        {step === "email" && (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <Field label="Email">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Button type="submit" disabled={!!busy}>
              {busy === "code" ? "Sending…" : "Email me a code"}
            </Button>
            {demoMode && (
              <button
                type="button"
                onClick={() => setStep("password")}
                className="min-h-11 text-sm text-ink-soft underline"
              >
                Demo account with a password
              </button>
            )}
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">We sent a 6-digit code to {email}.</p>
            <Field label="Code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputClass} tracking-widest`}
              />
            </Field>
            <Button type="submit" disabled={!!busy}>
              {busy === "verify" ? "Checking…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="min-h-11 text-sm text-ink-soft underline"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={withPassword} className="flex flex-col gap-3">
            <Banner tone="warn">Demo accounts only. Real users sign in with an email code.</Banner>
            <Field label="Email">
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Button type="submit" disabled={!!busy}>
              {busy === "password" ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="min-h-11 text-sm text-ink-soft underline"
            >
              Use an email code instead
            </button>
          </form>
        )}

        {error && <Banner tone="error">{error}</Banner>}
      </Card>
    </main>
  );
}
