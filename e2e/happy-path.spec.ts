// Happy-path smoke test: freelancer creates → edits → shares; a visitor sees the plan; the client approves
// with consent and reaches the PayPal hold step. Cleans up the deal it creates.
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

process.loadEnvFile(".env.local");

let dealId = "";
let shareUrl = "";

async function tryAs(page: Page, who: "freelancer" | "client") {
  await page.goto("/login");
  await page.getByRole("button", { name: `Try as ${who}` }).click();
  await expect(page).toHaveURL(/\/deals$/);
}

test.describe.serial("happy path", () => {
  test.afterAll(async () => {
    if (!dealId) return;
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    await admin.from("deals").delete().eq("id", dealId);
  });

  test("freelancer builds a plan, the sum check locks sharing, then shares", async ({ page }) => {
    await tryAs(page, "freelancer");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("link", { name: "New deal" }).first().click();
    await page.getByRole("tab", { name: "Type the details" }).click();
    await page
      .getByLabel("What did you agree?")
      .fill("Logo concepts, final logo and a brand kit for a coffee shop. £400.");
    await page.getByLabel("Client name").fill("Smoke Test Client");
    await page.getByLabel("Client WhatsApp number").fill("+44 7700 900123");
    await page.getByLabel("Client country").selectOption("GB");
    await expect(page.getByLabel("Deal currency")).toHaveValue("GBP"); // suggested from the country
    await page.getByLabel(/Total agreed/).fill("400");
    await page.getByRole("button", { name: "Build my plan with AI" }).click();

    await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+\/plan$/);
    dealId = page.url().split("/deals/")[1]!.split("/")[0]!;
    await expect(page.getByText("Adds up exactly", { exact: true })).toBeVisible();
    const share = page.getByRole("button", { name: "Create WhatsApp link" });
    await expect(share).toBeEnabled();

    // Breaking the sum locks sharing; the one-click fix + save unlocks it again.
    await page.getByRole("button", { name: "Increase milestone 1" }).click();
    await expect(page.getByText("£1.00 over the total")).toBeVisible();
    await expect(share).toBeDisabled();
    await page.getByRole("button", { name: "Put the difference on the last milestone" }).click();
    await expect(page.getByText("Adds up exactly", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    await expect(share).toBeEnabled();

    await share.click();
    await expect(page.getByRole("heading", { name: "Send it to your client" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/447700900123\?text=/,
    );
    shareUrl = (await page
      .getByRole("link", { name: "See what your client sees" })
      .getAttribute("href"))!;
    expect(shareUrl).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/);
  });

  test("anyone with the link sees the plan; approving needs consent", async ({ page }) => {
    await page.goto(new URL(shareUrl).pathname);
    await expect(page.getByRole("heading", { name: "How paying works" })).toBeVisible();
    await expect(page.getByText("£400.00").first()).toBeVisible();
    await expect(page.getByText("+447700900123")).toHaveCount(0); // phone number is never shown
    const approve = page.getByRole("button", { name: "Approve and continue" });
    await expect(approve).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(approve).toBeEnabled();
  });

  test("client approves with consent and reaches the PayPal hold step", async ({ page }) => {
    await tryAs(page, "client");
    await page.goto(new URL(shareUrl).pathname);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Approve and continue" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`));
    await expect(page.getByText("Waiting to be secured").first()).toBeVisible();
    await expect(page.getByText(/This places a hold: you are not charged until/)).toBeVisible();
    // The PayPal JS SDK renders its buttons in an iframe.
    await expect(page.locator('iframe[title*="PayPal"]').first()).toBeVisible();
  });
});
