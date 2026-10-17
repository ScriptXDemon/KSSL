import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createPartners, overlapDefs } from "./partners.js";
import { setClient, clientShort } from "./client.js";
import { buildCategories, verdictOf, impactText } from "./partnerCategories.js";
import * as pc from "./partnerCategories.js";

const d = JSON.parse(fs.readFileSync(new URL("../../fixtures/kssl_dataset.json", import.meta.url), "utf8"));
const rivals = Object.entries(d.competitors).filter(([, c]) => c.dir !== "client");

test("the category tables are gone from the code", () => {
  const cat = fs.readFileSync(new URL("./partnerCategories.js", import.meta.url), "utf8");
  const par = fs.readFileSync(new URL("./partners.js", import.meta.url), "utf8");
  assert.ok(!("PARTNER_CATEGORIES" in pc) && !("CATEGORY_GROUPS" in pc) && !("closenessOf" in pc));
  assert.ok(!/Exclusive distributor|Rental fleet|Packager|generator sets/i.test(cat));
  assert.ok(!/export const OV_KIND|export const OV_DEF|const REL_SHORT|const CONF_TAG|PG_REGION_ALIAS|DEFENSE_FIRM_COUNTRIES/.test(par));
  assert.ok(!/Brand choice moves to the counter|dealer quotes/i.test(par));
});

test("every relationship type in the dataset is a category of ui.partner_category", () => {
  const cats = buildCategories(d);
  assert.ok(cats.list.length > 0);
  rivals.forEach(([, c]) =>
    (c.partners || []).forEach((p) => assert.ok(cats.list.some((x) => x.key === p.rel), `${c.name}: ${p.label} -> ${p.rel}`)),
  );
  assert.ok(Object.keys(d.REL_LABEL).every((k) => cats.list.some((x) => x.key === k)), "REL_LABEL has a key the legend does not");
  assert.deepEqual(cats.list.map((c) => c.label), d.database.ui.partner_category.slice().sort((a, b) => a.display_order - b.display_order).map((r) => r.category_label));
});

test("a definition names the rival and the client from data; an unknown type has no invented text", () => {
  setClient(d.client);
  const cats = buildCategories(d);
  const k = cats.list.find((c) => /\{rival\}/.test(d.database.ui.partner_category.find((r) => r.category_key === c.key).definition));
  const txt = cats.categoryDef(k.key, "Zed Co", clientShort());
  assert.ok(txt.includes("Zed Co") && !/\{rival\}|\{client\}/.test(txt));
  const u = cats.categoryOf("no-such-type");
  assert.equal(u.label, "");
  assert.equal(u.def, "");
});

test("overlap definitions are the ui.partner_overlap_* rows", () => {
  const defs = overlapDefs(d);
  const kinds = d.database.ui.partner_overlap_kind;
  assert.deepEqual(Object.keys(defs).sort(), kinds.map((k) => k.overlap_kind).sort());
  const n = Object.values(defs).reduce((a, x) => a + x.fx.length, 0);
  assert.equal(n, d.database.ui.partner_overlap_effect.length);
  assert.deepEqual(overlapDefs({}), {});
});

test("one company is one node and the type groups follow the legend", () => {
  setClient(d.client);
  const P = createPartners(d);
  const [cid, c] = rivals.find(([, x]) => (x.partners || []).length > 1);
  const nodes = P.pgNodes({ ...c, id: cid });
  assert.ok(nodes.length >= 1 && nodes.length <= c.partners.length);
  const groups = P.pgTypeGroups({ ...c, id: cid }).map((g) => g.key);
  assert.ok(groups.every((g) => c.partners.some((p) => p.rel === g)));
});

test("the relationship brief names both parties and the client read; no raw tags", () => {
  setClient(d.client);
  const P = createPartners(d);
  const [cid, c] = rivals.find(([, x]) => (x.partners || []).some((p) => p.impact));
  const p = c.partners.find((x) => x.impact);
  const html = P.tieHtml({ ...c, id: cid }, cid, p.id);
  assert.ok(html.includes(p.label.split(" ")[0]));
  assert.ok(html.includes(`What it means for ${clientShort()}`));
  assert.ok(!/&lt;b&gt;|&lt;span/.test(html));
});

test("verdict and read parsing", () => {
  assert.equal(verdictOf({ verdict: "watch" }), "watch");
  assert.equal(verdictOf({ verdict: "Threat" }), "threat");
  assert.equal(impactText({ impact: "a  b <span style='o'>· <a href='u'>s</a></span>" }), "a b");
});

test("only threat and watch verdicts render: an 'opportunity' (or unset) verdict is no stance, no pill, no green", () => {
  setClient(d.client);
  const P = createPartners(d);
  const words = Object.fromEntries(d.database.ui.filter_option.filter((o) => o.filter_group === "stance").map((o) => [o.option_code, o.badge_label || o.option_label]));
  const all = rivals.flatMap(([cid, c]) => (c.partners || []).map((p) => ({ cid, c, p })));
  const by = (v) => all.filter(({ p }) => p.verdict === v);
  assert.ok(by("opportunity").length > 0 && by("threat").length > 0 && by("watch").length > 0, "the fixture holds all three stored verdicts");
  // a tie is opened by its partner's whole company key, so check the tie that carries only the verdict under test
  const html = ({ cid, c, p }) => P.tieHtml({ ...c, id: cid }, cid, p.id);
  for (const t of by("opportunity")) {
    const h = html(t);
    assert.ok(!/#e6f5ec|#1f7a46|#a9d9bc/.test(h), "no green verdict colour");
    const tied = (t.c.partners || []).filter((x) => x.label === t.p.label);
    if (tied.every((x) => x.verdict === "opportunity" || !x.verdict)) assert.ok(!/Read for/.test(h), "an opportunity-only tie has no 'Read for' verdict");
  }
  for (const t of by("threat")) {
    const h = html(t);
    assert.ok(h.includes(words.threat) && h.includes("#b5341f"), "a threat verdict draws the stored threat word in the threat colour");
  }
  for (const t of all.filter(({ p }) => !p.verdict)) {
    const tied = (t.c.partners || []).filter((x) => x.label === t.p.label);
    if (tied.every((x) => !x.verdict)) assert.ok(!/Read for/.test(html(t)), "no stored verdict, no verdict");
  }
  assert.equal(verdictOf({ verdict: "opportunity" }), null);
  assert.equal(verdictOf({ verdict: "fav" }), null);
  assert.equal(verdictOf({}), null);
  const src = ["partners.js", "partnerCategories.js"].map((f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n");
  assert.ok(!/opportunity/i.test(src), "no 'opportunity' stance path in the partnership code");
  assert.ok(!/#1f7a46|#e6f5ec/.test(src), "no green verdict style in the partnership code");
});
