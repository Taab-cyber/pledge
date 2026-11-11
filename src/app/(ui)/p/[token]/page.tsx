import { Suspense } from "react";
import { PublicPlanView } from "./public-plan-view";

export default function PublicPlanPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl p-6 text-sm text-ink-soft">Loading the plan…</main>
      }
    >
      <PublicPlanView />
    </Suspense>
  );
}
