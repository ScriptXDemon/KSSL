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
   The approve test unpublishes and re-approves a company card, which drops that company's products from the
   live DB: rebuild the pair (db/make_test_pair.sh) before every run. Never point this at :5178/:5180 (the user's servers). */

const REVIEW_URL = "http://127.0.0.1:5191";
const LIVE_URL = "http://127.0.0.1:5190";

/* [pillar, view] for every card route on the rail (src/lib/route.js RAIL) */
const ROUTES = [
  ["competitive", "overview"],
  ["competitive", "profile"],
  ["competitive", "threat-analysis"],
  ["competitive", "products"],
  ["competitive", "partnerships"],
  ["competitive", "positioning"],
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

test.describe("live build", () => {
  for (const [pillar, view, sel] of [
    ["competitive", "overview", ".alert"],
    ["competitive", "products", ".pat-li"],
    ["competitive", "positioning", ".mu-item"],
    ["market", "tender", ".tcard"],
  ]) {
    test(`${view}: no review controls render in the live build`, async ({ page }) => {
      await open(page, LIVE_URL, pillar, view);
      await expect(page.locator(sel).first()).toBeVisible({ timeout: 15000 }); // cards are on screen first
      await expect(page.locator(".rv-bar")).toHaveCount(0);
      await expect(page.locator(".rv-list")).toHaveCount(0);
      await expect(page.locator(".rv-banner")).toHaveCount(0);
    });
  }
});

test.describe("review build", () => {
  for (const [pillar, view] of ROUTES) {
    test(`${view}: every card route shows review bars and the banner`, async ({ page }) => {
      await open(page, REVIEW_URL, pillar, view);
      await expect(page.locator(".rv-banner")).toBeVisible();
      await expect(page.locator(".rv-bar").first()).toBeVisible({ timeout: 15000 });
    });
  }

  /* The card lists: every card that renders carries its own bar, not just one per page.
     [pillar, view, card selector] */
  const CARDS = [
    ["competitive", "overview", ".alert"],
    ["competitive", "threat-analysis", ".cm-row"],
    ["competitive", "products", ".product-card"],
    ["competitive", "positioning", ".mu-item"],
    ["competitive", "projects", ".alert"],
    ["market", "m-overview", "section.ti-simple tr.ti-row-link"],
    ["market", "tender", ".tcard"],
    ["market", "global-requirement", ".alert"],
    ["technology", "t-overview", ".alert"],
    ["technology", "innovation", ".innov"],
  ];
  for (const [pillar, view, sel] of CARDS) {
    test(`${view}: every ${sel} carries a review bar`, async ({ page }) => {
      await open(page, REVIEW_URL, pillar, view);
      const cards = page.locator(sel);
      await expect(cards.first()).toBeVisible({ timeout: 15000 });
      const n = await cards.count();
      const withBar = await cards.filter({ has: page.locator(".rv-bar") }).count();
      expect(withBar, `${withBar} of ${n} ${sel} carry a .rv-bar`).toBe(n);
    });
  }

  /* Market Intelligence: the outlook's segment rows (one assessment card each; its winners, buyers and
     drivers tables are counts over cards reviewed elsewhere), then the tender and award tables */
  for (const [tab, rowSel] of [
    [/Market outlook/i, ".ov-report .ovt-demand tbody tr"],
    [/Awarded/i, ".ov-report .ovt tbody tr"],
    [/active tenders/i, ".ov-report .ovt tbody tr"],
    [/Closed/i, ".ov-report .ovt tbody tr"],
  ]) {
    test(`m-report ${tab}: every table row carries a review bar`, async ({ page }) => {
      await open(page, REVIEW_URL, "market", "m-report");
      await page.locator(".ovtab", { hasText: tab }).first().click();
      // a segment row is a card only when a stored recommendation (the assessment row) stands in it
      const all = page.locator(rowSel);
      const rows = rowSel.includes("ovt-demand") ? all.filter({ has: page.locator("td:nth-child(5) .od-main") }) : all;
      await expect(rows.first()).toBeVisible({ timeout: 15000 });
      const n = await rows.count();
      const withBar = await rows.filter({ has: page.locator(".rv-bar") }).count();
      expect(withBar, `${withBar} of ${n} rows carry a .rv-bar`).toBe(n);
    });
  }

  /* Approve one card: the POST answers 200 and its status turns "live". The company card on the
     Competitor Profile has no parent card to approve first (a signal needs its competitor live). */
  test("approve returns 200 and the card turns live", async ({ page }) => {
    await open(page, REVIEW_URL, "competitive", "profile");
    const bar = page.locator(".cp-head .rv-bar").first();
    await expect(bar).toBeVisible({ timeout: 15000 });
    const post = () => page.waitForResponse((r) => r.url().includes("/api/review") && r.request().method() === "POST");
    // a previous run left it live: take it off first so the Approve below is a real transition
    if (await bar.locator(".rv-status.rv-live").count()) {
      const [off] = await Promise.all([post(), bar.getByRole("button", { name: "Unpublish", exact: true }).click()]);
      expect(off.status()).toBe(200);
      await expect(bar.locator(".rv-status.rv-new, .rv-status.rv-changed")).toBeVisible();
    }
    const [resp] = await Promise.all([post(), bar.getByRole("button", { name: /^Approve/ }).click()]);
    expect(resp.status()).toBe(200);
    await expect(bar.locator(".rv-status.rv-live")).toBeVisible();
    await expect(bar.locator(".rv-status")).toHaveText("live");
  });
});
