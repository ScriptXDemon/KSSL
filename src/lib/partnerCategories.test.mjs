import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createPartners, overlapDefs } from "./partners.js";
import { setClient, clientShort } from "./client.js";
import { buildCategories, verdictOf, meanText } from "./partnerCategories.js";
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
  const [cid, c] = rivals.find(([, x]) => (x.partners || []).some((p) => p.mean));
  const p = c.partners.find((x) => x.mean);
  const html = P.tieHtml({ ...c, id: cid }, cid, p.id);
  assert.ok(html.includes(p.label.split(" ")[0]));
  assert.ok(html.includes(`What it means for ${clientShort()}`));
  assert.ok(!/&lt;b&gt;|&lt;span/.test(html));
});

test("verdict and read parsing", () => {
  assert.equal(verdictOf("<b>Watch:</b> x"), "Watch");
  assert.equal(meanText("<b>Threat:</b> a b <span style='o'>· <a href='u'>s</a></span>"), "a b");
});
