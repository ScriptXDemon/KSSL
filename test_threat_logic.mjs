/* Threat is a stored field of the competitor and of the signal; the browser re-grades nothing
 * (lib/threat.js, ruling R5/R7).
 *
 *     node test_threat_logic.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as TH from "./src/lib/threat.js";
import { wireDataset } from "./src/lib/dataset.js";

const { threatOf } = TH;

// a competitor's threat is its own field, as stored; absent -> null
assert.equal(threatOf({ name: "x" }), null);
assert.equal(threatOf({ threat: "" }), null);
assert.equal(threatOf({ threat: null }), null);
assert.equal(threatOf({ threat: "threat" }), "threat");
assert.equal(threatOf({ threat: "watch" }), "watch");
assert.equal(threatOf({ threat: "fav" }), "fav");
assert.equal(threatOf(null), null);

// no keyword engine: the regex re-grader and its severity grades are gone
for (const gone of ["refineThreat", "refineThreats", "SEV", "NON_KSSL", "PLATFORM", "INDIA", "EXPORT"])
  assert.equal(gone in TH, false, `${gone} must not be exported`);
const src = readFileSync(new URL("./src/lib/threat.js", import.meta.url), "utf8");
assert.ok(!/RegExp|\/\b\(|saudi|spanish|qatari|ISR|electro|howitzer|india/i.test(src), "no keyword regexes in threat.js");

// the loader does not move a stored dir (threat / watch / fav) on any competitor signal
const fx = JSON.parse(readFileSync(new URL("./fixtures/kssl_dataset.json", import.meta.url)));
const wired = wireDataset(JSON.parse(JSON.stringify(fx)));
const stored = new Map(fx.competitiveCards.map((c) => [c.id, c.dir]));
assert.ok(stored.size > 0);
for (const c of wired.competitiveCards) {
  assert.equal(c.dir, stored.get(c.id), `${c.id}: dir is the stored word`);
  assert.equal("threatWhy" in c, false, "no browser-written threat reason");
}
// a partner's signal is not downgraded, an export signal is not capped: same cards, same words
assert.deepEqual(wired.competitiveCards.map((c) => c.dir), fx.competitiveCards.map((c) => c.dir));

// the competitor rows carry their threat word to the profile unchanged
for (const [id, c] of Object.entries(fx.competitors)) {
  if (c.dir === "client") continue;
  assert.equal(threatOf(wired.competitors[id]), threatOf(c));
}

console.log("ok - threat is the stored field; nothing is re-graded in the browser");
