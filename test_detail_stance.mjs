/* A detail without a stored stance shows no stance pill and no default class (project and tender rows opened from
 * the cockpit carry none).
 *
 *     node test_detail_stance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./src/components/detailPanel/DetailPanel.jsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("./src/pages/overview/Overview.jsx", import.meta.url), "utf8");

assert.ok(!/detail\.dir \|\| "watch"/.test(panel), "no default stance in DetailPanel");
assert.ok(/detail\.dir \|\| "none"/.test(panel));
// DIR_WORD has no entry for "none", so no pill is drawn
const m = panel.match(/const DIR_WORD = (\{[^}]*\})/);
assert.ok(m && !/none/.test(m[1]));
// the ad-hoc details opened from the cockpit hold no dir
const adhoc = overview.match(/select\(id, \{[\s\S]*?\}\);|select\(`tender-\$\{t\.id\}`, \{[\s\S]*?\}\);/g);
assert.equal(adhoc.length, 2);
for (const a of adhoc) assert.ok(!/\bdir\s*:/.test(a), "ad-hoc cockpit detail has no dir");
console.log("ok - no default stance on a detail that holds none");
