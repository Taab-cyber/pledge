import { Suspense } from "react";
import { PlanEditor } from "./plan-editor";

export default function PlanPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-soft">Loading the plan…</p>}>
      <PlanEditor />
    </Suspense>
  );
}
