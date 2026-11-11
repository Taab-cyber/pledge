"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type DealList } from "@/sdk/browser";

export default function DealsPage() {
  const router = useRouter();
  const [list, setList] = useState<DealList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.deals
      .list()
      .then(setList)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === "UNAUTHENTICATED")
          router.replace("/login?next=/deals");
        else setError(e instanceof Error ? e.message : "Could not load deals.");
      });
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your deals</h1>
        <Link href="/me" className="min-h-11 content-center text-sm underline">
          Profile
        </Link>
      </header>
      {error && <p role="alert">{error}</p>}
      {!list && !error && <p>Loading…</p>}
      {list?.deals.length === 0 && <p>No deals yet.</p>}
      <ul className="flex flex-col gap-2">
        {list?.deals.map((d) => (
          <li key={d.id}>
            <Link
              href={`/deals/${d.id}`}
              className="flex min-h-11 items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900"
            >
              <span>
                <strong>{d.title}</strong>
                <span className="block text-sm text-neutral-600">
                  {d.viewerRole === "freelancer" ? `Client: ${d.clientName}` : "You're the client"}{" "}
                  · {d.status}
                </span>
              </span>
              <span className="font-medium">{d.total.formatted}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
