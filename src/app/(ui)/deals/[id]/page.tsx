import { Suspense } from "react";
import { DealView } from "./deal-view";

// The deal id comes from the URL at request time, so the client view streams in after the shell.
export default function DealPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl p-6">Loading…</main>}>
      <DealView />
    </Suspense>
  );
}
