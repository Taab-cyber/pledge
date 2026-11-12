import { defineConfig, devices } from "@playwright/test";

// Smoke test of the happy path against a local dev server (real Supabase, mock AI, PayPal sandbox buttons
// not clicked). Run: npm run e2e
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build: no dev-mode recompiles/reloads, closer to what judges use.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      AI_PROVIDER: "mock",
      DEMO_MODE: "true",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
