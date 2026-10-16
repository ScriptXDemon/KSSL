/* Tender judgements are stored fields, never browser estimates (lib/tenderIntel.js).
 *
 *     node test_tender_intel.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as TI from "./src/lib/tenderIntel.js";

const { fitOf, revenueOf, cockpit } = TI;

// a tender with no fit field -> null; a stored fit is returned as it is
assert.equal(fitOf({ title: "x" }), null);
assert.equal(fitOf({ clientFit: "" }), null);
assert.equal(fitOf({ clientFit: "good" }), "good");
assert.equal(fitOf({ clientFit: "strong" }), "strong");

// revenue estimate absent -> null, never a computed number (0 is not "absent")
assert.equal(revenueOf({ title: "x" }), null);
assert.equal(revenueOf({ revenueMid: null }), null);
assert.equal(revenueOf({ revenueMid: "" }), null);
assert.equal(revenueOf({ revenueMid: "n/a" }), null);
assert.equal(revenueOf({ revenueMid: 2e6 }), 2e6);
assert.equal(revenueOf({ revenueMid: 0 }), 0);

// no value, fit weights, win probabilities or order lags are invented from other fields
assert.equal(revenueOf({ value: "USD 1 million", valueAmount: 1e6, clientFit: "strong" }), null);

// the old browser engine is gone: no ASSUME table, no winWeighted, no tenderIntel(), no genset test
for (const gone of ["ASSUME", "tenderIntel", "winWeighted", "decisionOf", "kindOf", "isTender", "isProject", "stageOf", "FIT_LABEL", "usdM"])
  assert.equal(gone in TI, false, `${gone} must not be exported`);

// the cockpit tables are the stored ones, in stored order, nothing re-ranked
const fx = JSON.parse(readFileSync(new URL("./fixtures/kssl_dataset.json", import.meta.url)));
const c = cockpit(fx);
assert.deepEqual(c.tenders.map((r) => r.id), fx.topOpportunities.topTenders.map((r) => r.id));
assert.deepEqual(c.projects.map((r) => r.id), fx.topOpportunities.projectsBeforeTender.map((r) => r.id));
assert.deepEqual(c.moves.map((r) => r.id), fx.topOpportunities.nextMoves.map((r) => r.id));
assert.ok(c.tenders.length > 0 && c.projects.length > 0 && c.moves.length > 0);
assert.deepEqual(cockpit({}), { tenders: [], projects: [], moves: [], notes: {} });

// every fixture tender reads its fit and revenue from its own fields
for (const t of fx.tenders) {
  assert.equal(fitOf(t), t.clientFit ?? null);
  assert.equal(revenueOf(t), t.revenueMid == null ? null : Number(t.revenueMid));
}

// the module source carries no genset assumption
const src = readFileSync(new URL("./src/lib/tenderIntel.js", import.meta.url), "utf8");
assert.ok(!/genset|kva|generator|pWin|fitWeight|orderLag/i.test(src));

console.log("ok - tender fit and revenue are stored fields; cockpit rows are the stored rows");
