"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, supabaseBrowser, type MeResponse } from "@/sdk/browser";
import { Banner } from "./kit";

const MeContext = createContext<{ me: MeResponse; refresh: () => Promise<void> } | null>(null);

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used inside AppShell");
  return ctx;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = async () => {
    try {
      setMe(await api.me.get());
    } catch (e) {
      if (e instanceof ApiError && e.code === "UNAUTHENTICATED")
        router.replace(`/login?next=${encodeURIComponent(path)}`);
    }
  };

  useEffect(() => {
    let alive = true;
    api.me
      .get()
      .then((m) => alive && setMe(m))
      .catch((e: unknown) => {
        if (alive && e instanceof ApiError && e.code === "UNAUTHENTICATED") {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        }
      });
    return () => { alive = false; };
  }, [router]);

  if (!me)
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#6d7f95" }}>Loading…</div>
    );

  const role = me.profile.role;
  const nav =
    role === "client"
      ? [
          { href: "/deals", label: "My projects", icon: "▤" },
          { href: "/me", label: "Profile", icon: "◎" },
        ]
      : [
          { href: "/deals", label: "Dashboard", icon: "▤" },
          { href: "/deals/new", label: "New deal", icon: "＋" },
          { href: "/me", label: "Profile", icon: "◎" },
        ];

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  const Logo = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "#00a5ec",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        P
      </div>
      <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.4px", color: "#002970" }}>Pledge</span>
    </div>
  );

  const navList = (
    <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {nav.map((n) => {
        const active =
          n.href === "/deals"
            ? path === "/deals" || (path.startsWith("/deals/") && path !== "/deals/new")
            : path === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 42,
              padding: "10px 13px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              color: active ? "#008bd0" : "#586b80",
              background: active ? "#e8f6ff" : "transparent",
              textDecoration: "none",
              transition: "background .15s,color .15s",
            }}
          >
            <span style={{ fontSize: 14, opacity: 0.7 }}>{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const who = (
    <div
      style={{
        borderTop: "1px solid #e6edf3",
        paddingTop: 16,
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#e4f4fc",
            color: "#087fbd",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {(me.profile.full_name ?? me.user.email ?? "?")[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 11, color: "#253d59" }}>
            {me.profile.full_name ?? me.user.email}
          </div>
          <div style={{ fontSize: 9, color: "#8b9bae", marginTop: 2 }}>
            {role === "freelancer" ? "Freelancer" : role === "client" ? "Client" : "No role yet"}
            {me.profile.is_demo && " · demo"}
          </div>
        </div>
      </div>
      <button
        onClick={signOut}
        style={{
          minHeight: 36,
          background: "none",
          border: "none",
          textAlign: "left",
          fontSize: 11,
          color: "#8b9bae",
          textDecoration: "underline",
          cursor: "pointer",
          paddingLeft: 0,
        }}
      >
        Sign out
      </button>
    </div>
  );

  return (
    <MeContext.Provider value={{ me, refresh }}>
      <div style={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: "238px 1fr" }} className="app-shell-grid">
        {/* Desktop sidebar */}
        <aside
          className="app-sidebar-desktop"
          style={{
            background: "#fff",
            borderRight: "1px solid #e6edf3",
            padding: "24px 15px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: "2px 0 8px rgba(24,66,105,.025)",
          }}
        >
          <Link href="/deals" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#9aaabd",
              padding: "0 12px",
            }}
          >
            {role === "client" ? "CLIENT" : "WORKSPACE"}
          </div>
          {navList}
          {who}
        </aside>

        {/* Mobile top bar */}
        <header
          className="app-topbar-mobile"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
            borderBottom: "1px solid #e6edf3",
            padding: "0 16px",
            height: 60,
            boxShadow: "0 2px 8px rgba(24,66,105,.035)",
            gridColumn: "1/-1",
          }}
        >
          <Link href="/deals" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
          <button
            style={{
              minHeight: 40,
              padding: "0 12px",
              borderRadius: 7,
              border: "1px solid #e6edf3",
              background: "#fff",
              fontSize: 12,
              fontWeight: 600,
              color: "#496078",
              cursor: "pointer",
            }}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
        </header>

        {menuOpen && (
          <div
            className="app-mobile-menu"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              background: "#fff",
              borderBottom: "1px solid #e6edf3",
              padding: 16,
              gridColumn: "1/-1",
            }}
          >
            {navList}
            {who}
          </div>
        )}

        {/* Main content */}
        <main
          style={{
            padding: "32px clamp(16px,4vw,56px) 64px",
            maxWidth: 1100,
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {!me.onboarded && path !== "/me" && (
            <Banner tone="warn" title="Finish your profile">
              <Link href="/me" style={{ textDecoration: "underline", color: "inherit" }}>
                Add your name, country{role === "freelancer" ? " and PayPal email" : ""}
              </Link>{" "}
              to continue.
            </Banner>
          )}
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .app-shell-grid { grid-template-columns: 1fr !important; }
          .app-sidebar-desktop { display: none !important; }
          .app-topbar-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .app-topbar-mobile { display: none !important; }
        }
      `}</style>
    </MeContext.Provider>
  );
}
