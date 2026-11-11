"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, supabaseBrowser, type MeResponse } from "@/sdk/browser";
import { Banner } from "./kit";

const MeContext = createContext<{ me: MeResponse; refresh: () => Promise<void> } | null>(null);

/** The signed-in user (role, profile). Only usable inside the (app) pages. */
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
    return () => {
      alive = false;
    };
  }, [router]);

  if (!me) return <div className="p-6 text-sm text-ink-soft">Loading…</div>;

  const role = me.profile.role;
  const nav =
    role === "client"
      ? [
          { href: "/deals", label: "My projects" },
          { href: "/me", label: "Profile" },
        ]
      : [
          { href: "/deals", label: "Dashboard" },
          { href: "/deals/new", label: "New deal" },
          { href: "/me", label: "Profile" },
        ];

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  const navList = (
    <nav aria-label="Main" className="flex flex-col gap-1">
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
            className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-medium ${active ? "bg-accent-soft text-accent" : "text-ink hover:bg-ground"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const who = (
    <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
      <span className="font-semibold">{me.profile.full_name ?? me.user.email}</span>
      <span className="text-xs text-ink-soft">
        {role === "freelancer" ? "Freelancer" : role === "client" ? "Client" : "No role yet"}
        {me.profile.is_demo && " · demo account"}
      </span>
      <button
        onClick={signOut}
        className="min-h-11 rounded-xl text-left text-sm text-ink-soft underline"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <MeContext.Provider value={{ me, refresh }}>
      <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden flex-col justify-between gap-6 border-r border-line bg-white p-5 md:flex">
          <div className="flex flex-col gap-6">
            <Link href="/deals" className="text-xl font-bold text-accent">
              Pledge
            </Link>
            {navList}
          </div>
          {who}
        </aside>
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-2 md:hidden">
          <Link href="/deals" className="text-lg font-bold text-accent">
            Pledge
          </Link>
          <button
            className="min-h-11 rounded-xl px-3 text-sm font-medium"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
        </header>
        {menuOpen && (
          <div
            id="mobile-menu"
            className="flex flex-col gap-4 border-b border-line bg-white p-4 md:hidden"
          >
            {navList}
            {who}
          </div>
        )}
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
          {!me.onboarded && path !== "/me" && (
            <Banner tone="warn" title="Finish your profile">
              <Link href="/me" className="underline">
                Add your name, country{role === "freelancer" ? " and PayPal email" : ""}
              </Link>{" "}
              to continue.
            </Banner>
          )}
          {children}
        </main>
      </div>
    </MeContext.Provider>
  );
}
