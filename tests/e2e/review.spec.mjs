// @ts-check
import { test, expect } from "@playwright/test";

/* The review layer: in the review build (vite --mode review, backend KSSL_VIEW=review) every
   card on every card route carries a .rv-bar and the page carries the .rv-banner. In the live
   build nothing of it renders.

   Run against the throwaway test pair (db/make_test_pair.sh, NOT --approve-all, so the review
   backend shows the cards as "new"):
     review  KSSL_API_TARGET=http://127.0.0.1:8611 npx vite --mode review --port 5191
     live    KSSL_API_TARGET=http://127.0.0.1:8610 npx vite --port 5190
     npx playwright test -c playwright.review.config.mjs
   Never point this at :5178/:5180 (the user's servers). */

const REVIEW_URL = "http://127.0.0.1:5191";
const LIVE_URL = "http://127.0.0.1:5190";

/* [pillar, view] for every card route on the rail (src/lib/route.js RAIL) */
const ROUTES = [
  ["competitive", "overview"],
  ["competitive", "profile"],
  ["competitive", "threat-analysis"],
  ["competitive", "products"],
  ["competitive", "partnerships"],
  ["competitive", "projects"],
  ["competitive", "geo"],
  ["competitive", "patents-comp"],
  ["market", "m-overview"],
  ["market", "tender"],
  ["market", "global-requirement"],
  ["market", "m-report"],
  ["technology", "t-overview"],
  ["technology", "innovation"],
];

const open = async (page, base, pillar, view) => {
  await page.goto(`${base}/#p=${pillar}&v=${view}`);
  await expect(page.locator(".shell")).toBeVisible({ timeout: 30000 });
  await page.locator(".rail .svc").first().waitFor({ state: "visible", timeout: 20000 });
};

test.describe("review build", () => {
  for (const [pillar, view] of ROUTES) {
    test(`${view}: every card route shows review bars and the banner`, async ({ page }) => {
      await open(page, REVIEW_URL, pillar, view);
      await expect(page.locator(".rv-banner")).toBeVisible();
      await expect(page.locator(".rv-bar").first()).toBeVisible({ timeout: 15000 });
    });
  }

  /* Approve one card: the POST answers 200 and its status turns "live" */
  test("approve returns 200 and the card turns live", async ({ page }) => {
    await open(page, REVIEW_URL, "competitive", "overview");
    const bar = page.locator(".rv-bar", { has: page.locator(".rv-status.rv-new") }).first();
    await expect(bar).toBeVisible({ timeout: 15000 });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/review") && r.request().method() === "POST"),
      bar.getByRole("button", { name: "Approve", exact: true }).click(),
    ]);
    expect(resp.status()).toBe(200);
    // the first card of the feed is now live (its bar re-renders with the new status)
    await expect(page.locator(".rv-bar .rv-status.rv-live").first()).toBeVisible();
  });
});

test.describe("live build", () => {
  test("no review controls render in the live build", async ({ page }) => {
    await open(page, LIVE_URL, "competitive", "overview");
    await expect(page.locator(".rv-bar")).toHaveCount(0);
    await expect(page.locator(".rv-banner")).toHaveCount(0);
  });
});
