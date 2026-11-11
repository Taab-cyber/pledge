import { Suspense, type ReactNode } from "react";
import { AppShell } from "../_ui/app-shell";

// Signed-in area. The shell reads the session in the browser, so it streams in after the static frame.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-soft">Loading…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
