import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createPartners } from "./partners.js";
import { PARTNER_CATEGORIES, categoryOf, verdictOf, meanText } from "./partnerCategories.js";

const file = new URL("../../../parallax-cummins-arabia-datapack/dataset.html.json", import.meta.url);
const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;

test("every relationship type in the dataset is a named category, none falls to Other", { skip: !d }, () => {
  const known = new Set(PARTNER_CATEGORIES.map((c) => c.key));
  Object.values(d.competitors).forEach((c) =>
    (c.partners || []).forEach((p) => assert.ok(known.has(p.rel) && categoryOf(p.rel).key !== "other", `${c.name}: ${p.label} -> ${p.rel}`)),
  );
  assert.ok(Object.keys(d.REL_LABEL).every((k) => known.has(k)), "REL_LABEL has a key the categories do not");
});

test("one company is one node: Zahid Group's four Caterpillar rows merge, others stay apart", { skip: !d }, () => {
  const P = createPartners(d);
  const cat = { ...d.competitors.CATERPIL, id: "CATERPIL" };
  const nodes = P.pgNodes(cat);
  assert.equal(cat.partners.length, 14);
  assert.equal(nodes.length, 11);
  const z = nodes.find((n) => n.rows.length > 1);
  assert.equal(z.rows.length, 4);
  assert.equal(z.label, "Zahid Group");
  assert.deepEqual(P.pgTypeGroups(cat).map((g) => g.key), ["dist", "rental", "framework", "mou", "account"]);
  Object.entries(d.competitors).forEach(([id, c]) => {
    if (id === "CATERPIL" || !c.partners || !c.partners.length) return;
    assert.equal(P.pgNodes({ ...c, id }).length, c.partners.length, `${c.name} must not lose or merge partners`);
  });
});

test("the relationship brief names both parties, the category, and the Cummins read; no raw tags", { skip: !d }, () => {
  const P = createPartners(d);
  const cat = { ...d.competitors.CATERPIL, id: "CATERPIL" };
  const html = P.tieHtml(cat, "CATERPIL", "ZAHIDTRA");
  assert.ok(html.includes("Caterpillar ↔ Zahid Group"));
  assert.ok(html.includes("Exclusive distributor") && html.includes("Rental fleet supply") && html.includes("Framework supplier"));
  assert.ok(html.includes("What it means for Cummins Arabia") && html.includes("Threat"));
  assert.ok(!/&lt;b&gt;|&lt;span/.test(html), "raw tags leaked into the text");
});

test("verdict and read parsing", () => {
  assert.equal(verdictOf("<b>Watch:</b> x"), "Watch");
  assert.equal(meanText("<b>Threat:</b> a b <span style='o'>· <a href='u'>s</a></span>"), "a b");
});
