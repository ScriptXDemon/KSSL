/* The Tender Intelligence cockpit's numbers (lib/tenderIntel.js).
 *
 *     node test_tender_intel.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tenderIntel, winWeighted, decisionOf, kindOf } from "./src/lib/tenderIntel.js";

const today = new Date("2026-09-29T00:00:00Z");
const t = (o) => ({ rank: 1, status: "open", dl: 10, cat: "Healthcare", country: "Saudi Arabia", ...o });
const data = {
  client: { id: "C" },
  competitors: {
    C: { products: [{ name: "C800D6E", hz: 60, specs: { "Standby rating": "1000 kVA / 800 kW" } }] },
    R: { products: [{ name: "KD1500", hz: 60, specs: { "Standby rating": "1,875 kVA / 1500 kW" } },
                    { name: "KD1000", hz: 60, specs: { "Standby rating": "1,050 kVA / 840 kW" } }] },
  },
  tenders: [
    t({ title: "live strong", revenueMid: 2e6, clientFit: "strong", matches: [{ n: "C800D6E" }],
        competitorFit: [{ company: "Rehlko", products: ["KD1000"] }], actions: [{ do: "buy booklet", due: "2026-10-03" }] }),
    t({ title: "pursuit partial", revenueMid: 10e6, clientFit: "partial", pursuit: true, dl: 9999,
        competitorFit: [{ company: "Rehlko", products: ["KD1500"] }], competitors: ["Al-Rashid group (6 of 12)", "Caterpillar", "MHI", "Abdullah Abunayyan Trading (Kohler)"] }),
    t({ title: "poor", revenueMid: 1e9, clientFit: "poor" }),
    t({ title: "unranked", rank: undefined, revenueMid: 5e6, clientFit: "strong" }),
  ],
};
const I = tenderIntel(data, today);

// the poor fit's USD 1bn never counts; the unranked row is out
assert.equal(I.headline.inPlay, 12e6);
assert.equal(I.headline.fits, 2e6);
assert.equal(I.headline.poor, 1);
assert.equal(I.headline.closingSoon, 2e6);                  // live, fits, dl 10 <= 21
// win-weighted: 2M x 1 x 0.25 + 10M x 0.5 x 0.1
assert.equal(Math.round(I.funnel[2].v), 1e6);
assert.equal(winWeighted(data.tenders[2]), 0);
// a pursuit decides at the assumed horizon, estimated; a live tender on its own date
assert.equal(decisionOf(data.tenders[1], today).est, true);
assert.equal(decisionOf(data.tenders[0], today).est, false);
assert.equal(kindOf({ title: "Dorra main EPC tender" }), "main");
// product gap: KD1500 (1,875 kVA, 60 Hz) has no client set within 12 %; KD1000 (1,050) does
assert.equal(I.gap.n, 1);
assert.equal(I.gap.v, 10e6);
// channels skip OEMs; actions carry their tender and days left
assert.deepEqual(I.channels.map((c) => c.name), ["Al-Rashid group", "Abdullah Abunayyan Trading"]);
assert.equal(I.channels[1].tied, "Kohler");                // a route, but a rival's
assert.equal(I.actions[0].days, 4);
assert.equal(I.rivals[0].company, "Rehlko");

// smoke over the served export: every section populates
const real = JSON.parse(readFileSync(new URL("../datapack/dataset.html.json", import.meta.url)));
const R = tenderIntel(real, today);
assert.ok(R.headline.inPlay > 0 && R.forecast.length > 0 && R.segments.length > 0 && R.points.length > 0);
console.log("ok - funnel, forecast, gap, channels, actions; served export:",
  `USD ${(R.headline.inPlay / 1e6).toFixed(1)}M in play, gap USD ${(R.gap.v / 1e6).toFixed(1)}M on ${R.gap.n} tenders`);

import { isTender, isProject } from "./src/lib/tenderIntel.js";
assert.ok(isTender({ status: "open", title: "Supply of gensets" }));
assert.ok(!isTender({ pursuit: true, status: "evaluation", title: "Replacement of backup power sources" })); // closed, award pending: not open for bids
assert.ok(!isTender({ pursuit: true, status: "evaluation", title: "Riyadh data centre: main EPC" }));     // an EPC bid is a project
assert.ok(!isTender({ pursuit: true, status: "upcoming", title: "Khazna data centre" }));
assert.ok(!isTender({ status: "open", title: "Dubai Metro Gold Line: design-build prequalification (emergency generators inside E&M)" })); // a main contract is a project
assert.ok(isProject({ status: "open", title: "King Saud Air Base: Phase Two design-and-build (power generation)" }));
assert.ok(!isTender({ status: "open", title: "Construction and maintenance of public buildings, incl. generators" }) && !isProject({ status: "open", title: "Construction and maintenance of public buildings, incl. generators" }));
assert.ok(!isTender({ status: "evaluation", closingDate: "2026-01-11", title: "Replacement of backup power sources, hospital" }, new Date("2026-10-14"))); // closed 9 months ago
assert.ok(!isProject({ pursuit: true, status: "evaluation", dl: -275, title: "Replacement of backup power sources, hospital" })); // closed direct tender: on neither table
assert.ok(isTender({ status: "open", dl: 5, title: "Supply of generator sets" }) && !isProject({ status: "open", title: "Supply of generator sets" }));
assert.ok(!isTender({ status: "open", closingDate: "2026-10-13", title: "Supply of generator sets" }, new Date("2026-10-14T12:00:00")) && isTender({ status: "open", closingDate: "2026-10-14", title: "Supply of generator sets" }, new Date("2026-10-14T12:00:00"))); // closes today is still open
assert.ok(!isTender({ rank: 9, status: "open", dl: 5, title: "Supply of generator sets" })); // aggregator mirror only: no status check
assert.ok(isTender({ rank: 9, status: "open", dl: 5, statusChecked: "open", title: "Supply of generator sets" }));
assert.ok(!isProject({ pursuit: true, status: "upcoming", req: [["Published", "03 Sep 2025"]], title: "Khazna data centre" }, new Date("2026-10-14"))); // last report over a year old
assert.ok(isProject({ pursuit: true, status: "upcoming", req: [["Published", "06 Oct 2026"]], title: "Khazna data centre" }, new Date("2026-10-14")));
console.log("ok - isTender");
