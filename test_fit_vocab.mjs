/* The fit words are the stored ones (strong / partial / weak), compared as served.
 * A "weak" tender is not a fit, and its label must render.
 *
 *     node --test test_fit_vocab.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { tenderIntel, winWeighted, FIT_LABEL } from "./src/lib/tenderIntel.js";
import { sizes } from "./src/lib/marketOutlook.js";

const today = new Date("2026-09-29T00:00:00Z");
const t = (o) => ({ rank: 1, status: "open", dl: 10, cat: "Ammunition", country: "Poland", ...o });
const data = {
  client: { id: "C" },
  competitors: { C: { products: [] } },
  tenders: [
    t({ title: "strong one", revenueMid: 2e6, clientFit: "strong" }),
    t({ title: "weak one", revenueMid: 1e9, clientFit: "weak" }),
  ],
};

test("weak is not a fit and carries no revenue or weight", () => {
  const I = tenderIntel(data, today);
  assert.equal(I.headline.inPlay, 2e6);
  assert.equal(I.headline.fits, 2e6);
  assert.equal(I.headline.weak, 1);
  assert.equal(winWeighted(data.tenders[1]), 0);
});

test("market outlook sizes do not count a weak tender as ranked", () => {
  assert.equal(sizes(data).ranked, 1);
});

test("every served fit word has a label, weak included", () => {
  for (const w of ["strong", "partial", "weak"]) assert.ok(FIT_LABEL[w], `no label for ${w}`);
  assert.equal(FIT_LABEL.poor, undefined);
});
