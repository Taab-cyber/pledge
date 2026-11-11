import { createFrankfurterProvider } from "./ecb/frankfurter";
import type { FxProvider } from "./types";

let provider: FxProvider | null = null;
let override: FxProvider | null = null;

export function getFxProvider(): FxProvider {
  if (override) return override;
  provider ??= createFrankfurterProvider();
  return provider;
}

export function setFxProviderForTests(p: FxProvider | null): void {
  override = p;
}

export type * from "./types";
