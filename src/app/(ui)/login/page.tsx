"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, supabaseBrowser } from "@/sdk/browser";
import { Banner, Button, Field, inputClass } from "../_ui/kit";

type Step = "email" | "code" | "password";

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
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(135deg,#f0faff 0%,#e8f7ff 55%,#f8fcff 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Logo */}
      <Link href="/" style={{ textDecoration: "none", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#00a5ec",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 17,
              boxShadow: "0 4px 12px rgba(0,165,236,.3)",
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.6px", color: "#002970" }}>
            Pledge
          </span>
        </div>
      </Link>

      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Demo card */}
        {demoMode && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #9ddcf5",
              borderRadius: 12,
              padding: "20px 22px",
              boxShadow: "0 4px 16px rgba(0,165,236,.12)",
            }}
          >
            <div
              style={{
                display: "inline-block",
                background: "#eaf7ff",
                color: "#087fbd",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                padding: "4px 8px",
                borderRadius: 4,
                marginBottom: 10,
              }}
            >
              Demo Access
            </div>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: "#172b4d", margin: "0 0 8px" }}>
              Judging Pledge? Skip sign-up
            </h2>
            <p style={{ fontSize: 12, color: "#6d7f95", lineHeight: 1.6, margin: "0 0 16px" }}>
              Use demo accounts — Riya (brand designer, India) and Daniel (client, UK). PayPal sandbox, no real money.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                disabled={!!busy}
                onClick={() => tryAs("client")}
                style={{
                  minHeight: 42,
                  borderRadius: 7,
                  border: "none",
                  background: "#00a5ec",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,165,236,.25)",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy === "client" ? "Signing in…" : "👤 Try as client"}
              </button>
              <button
                disabled={!!busy}
                onClick={() => tryAs("freelancer")}
                style={{
                  minHeight: 42,
                  borderRadius: 7,
                  border: "1px solid #d6e2ec",
                  background: "#fff",
                  color: "#496078",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy === "freelancer" ? "Signing in…" : "🎨 Try as freelancer"}
              </button>
            </div>
          </div>
        )}

        {/* Sign-in card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e6edf3",
            borderRadius: 12,
            padding: "24px 24px",
            boxShadow: "0 2px 12px rgba(28,66,101,.06)",
          }}
        >
          <h1 style={{ fontWeight: 700, fontSize: 20, color: "#172b4d", margin: "0 0 20px", letterSpacing: "-0.5px" }}>
            Sign in
          </h1>

          {step === "email" && (
            <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Email">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </Field>
              <Button type="submit" disabled={!!busy} style={{ minHeight: 44 }}>
                {busy === "code" ? "Sending…" : "Email me a code →"}
              </Button>
              {demoMode && (
                <button
                  type="button"
                  onClick={() => setStep("password")}
                  style={{
                    minHeight: 40,
                    background: "none",
                    border: "none",
                    fontSize: 12,
                    color: "#8b9bae",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Demo account with a password
                </button>
              )}
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "#6d7f95", margin: 0, lineHeight: 1.6 }}>
                We sent a 6-digit code to <strong style={{ color: "#172b4d" }}>{email}</strong>.
              </p>
              <Field label="Code">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${inputClass} tracking-widest`}
                  placeholder="000000"
                />
              </Field>
              <Button type="submit" disabled={!!busy} style={{ minHeight: 44 }}>
                {busy === "verify" ? "Checking…" : "Sign in →"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("email")}
                style={{
                  minHeight: 40,
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#8b9bae",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={withPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              <Button type="submit" disabled={!!busy} style={{ minHeight: 44 }}>
                {busy === "password" ? "Signing in…" : "Sign in →"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("email")}
                style={{
                  minHeight: 40,
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#8b9bae",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Use an email code instead
              </button>
            </form>
          )}

          {error && <div style={{ marginTop: 12 }}><Banner tone="error">{error}</Banner></div>}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#8b9bae", margin: 0 }}>
          Pledge never holds money — PayPal pays freelancers directly.
        </p>
      </div>
    </div>
  );
}
