/* LABELS, PILLS AND TILES ARE DATABASE ROWS (docs/ui_port/MAPPING.md section E, rulings R2 / R12).
 *
 *     node test_ui_labels.mjs
 *
 * Reads fixtures/kssl_dataset.json (the KSSL test dataset) and holds the three overview lanes, the rail, the
 * Market report tiles and the stance words to the ui / serving rows they come from:
 *   - change a stored label and the pill / tile / rail word follows; no row, no pill / tile / item;
 *   - a tile is bound to its count by key, never by its label text;
 *   - the only stances are threat and watch: a row stored with any other stance (the fixture has one) has no
 *     stance, no pill, no colour, is not counted, and is kept off the competitive overview;
 *   - no label string of these lanes is a literal in the lane code, and the word "favourable" is nowhere in src.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { wireDataset } from "./src/lib/dataset.js";
import { metricsFor, tilePredicate, filterMatch } from "./src/lib/overview.js";
import { uiText, filterOptions, stanceWords, stanceOf } from "./src/lib/uiText.js";
import { railFor, navTitle, setPillarNames, PILLAR_LABEL } from "./src/lib/route.js";
import { marketMetrics } from "./src/lib/marketOverview.js";
import { maturityWord, positionWord, maturityLabel } from "./src/lib/innovation.js";

const fx = JSON.parse(readFileSync("fixtures/kssl_dataset.json", "utf-8"));
const clone = () => JSON.parse(JSON.stringify(fx));
const ok = (m) => console.log("  ok   " + m);

/* ---- uiText: a stored cell, or "" ---------------------------------------------------------------- */
assert.equal(uiText(fx, "ui.competitive_navigation", { view_key: "geo" }, "view_label"), "Geo Footprint");
assert.equal(uiText(fx, "ui.competitive_navigation", { view_key: "nope" }, "view_label"), "");
assert.equal(uiText({}, "ui.competitive_navigation", { view_key: "geo" }, "view_label"), "");
assert.equal(uiText(null, "ui.x", {}, "y"), "");
ok("uiText returns the stored cell, or an empty string: never a literal");

/* ---- competitive lane: three tiles by key, pills from the stance rows -------------------------------- */
{
  const d = wireDataset(clone());
  const cfg = d.overviewConfig.competitive;
  const m = metricsFor(cfg, "competitive", d);
  const drawn = m.filter((x) => !x.blank);
  assert.deepEqual(drawn.map((x) => x.key), ["companies_tracked", "threats", "watch"]);
  assert.deepEqual(drawn.map((x) => x.l), ["Competitors tracked", "Competitive threats", "Watch signals"], "the words are the stored labels");
  assert.equal(m.length, 5, "five slots: the unused ones are empty cells");
  const n = (dir) => cfg.cards.filter((c) => c.dir === dir).length;
  assert.equal(m.find((x) => x.key === "threats").v, String(n("threat")));
  assert.equal(m.find((x) => x.key === "watch").v, String(n("watch")));
  assert.deepEqual(cfg.filters.map((f) => f.l), ["All", "Threat", "Watch"], "pills: the reset plus one per stored stance");
  assert.equal(cfg.title, "Competitive Intelligence");
  ok("competitive overview: 3 tiles bound by metric_key with stored labels; pills All / Threat / Watch");

  // the pill words follow the table
  const r = clone();
  r.database.ui.filter_option = r.database.ui.filter_option.map((o) =>
    o.filter_group === "stance" && o.option_code === "threat" ? { ...o, option_label: "Danger", badge_label: "Danger" } : o);
  const d2 = wireDataset(r);
  assert.deepEqual(d2.overviewConfig.competitive.filters.map((f) => f.l), ["All", "Danger", "Watch"]);
  assert.equal(d2.overviewConfig.competitive.dirWord.threat, "Danger");
  ok("a changed stance label in ui.filter_option is the pill and badge word");

  // a tile is bound by key: renaming its label keeps its count
  const r2 = clone();
  r2.database.ui.competitive_metric = r2.database.ui.competitive_metric.map((x) =>
    x.metric_key === "threats" ? { ...x, metric_label: "Hot items" } : x);
  const d3 = wireDataset(r2);
  const t = metricsFor(d3.overviewConfig.competitive, "competitive", d3).find((x) => x.key === "threats");
  assert.equal(t.l, "Hot items");
  assert.equal(t.v, String(n("threat")));
  ok("a renamed tile label keeps its count (bound by key)");

  // no rows -> no strip, no pills, no crash
  const e0 = clone();
  e0.database.ui.competitive_metric = [];
  const e = wireDataset(e0);
  assert.equal(metricsFor(e.overviewConfig.competitive, "competitive", e).length, 0);
  const e2 = clone();
  e2.database.ui.filter_option = [];
  const d4 = wireDataset(e2);
  assert.deepEqual(d4.overviewConfig.competitive.filters, []);
  assert.deepEqual(d4.overviewConfig.technology.filters, []);
  assert.deepEqual(d4.overviewConfig.market.filters, []);
  ok("no stored tile rows: no strip; no stored pill rows: no pills (no default set)");
}

/* ---- the only stances are threat and watch -------------------------------------------------------- */
{
  const d = wireDataset(clone());
  const legacy = fx.competitiveCards.filter((c) => c.dir && c.dir !== "threat" && c.dir !== "watch");
  assert.ok(legacy.length > 0, "the fixture holds a card stored with a third stance");
  const filters = d.overviewConfig.competitive.filters;
  for (const c of legacy) {
    const w = d.competitiveCards.find((x) => x.id === c.id);
    assert.equal(w.dir, "", "no stance, never relabelled");
    assert.equal(d.overviewConfig.competitive.cards.some((x) => x.id === c.id), false, "kept off the competitive overview");
    for (const f of filters) if (f.f !== "all") assert.equal(filterMatch(w, f.f, filters), false);
    for (const a of ["threat", "watch"]) assert.equal(tilePredicate(a)(w), false, `not counted in the ${a} tile`);
  }
  assert.deepEqual(stanceWords(fx), { threat: "Threat", watch: "Watch" });
  assert.deepEqual(filterOptions(fx, "stance").map((o) => o.label), ["Threat", "Watch"], "the stance filter offers only the seeded threat / watch labels");
  // a row stored under another stance code is not offered, whatever the table holds
  const r = clone();
  r.database.ui.filter_option.push({ filter_group: "stance", option_code: "other", option_label: "Other", badge_label: "Other", display_order: 9 });
  assert.deepEqual(Object.keys(stanceWords(r)), ["threat", "watch"]);
  assert.deepEqual(wireDataset(r).overviewConfig.competitive.filters.map((f) => f.f), ["all", "threat", "watch"]);
  assert.equal(stanceOf("other"), "");
  ok("a stored third stance has no pill, no colour, no count and no place on the competitive overview");
}

/* ---- technology and market lanes ------------------------------------------------------------------ */
{
  const d = wireDataset(clone());
  const t = d.overviewConfig.technology;
  const tm = metricsFor(t, "technology", d).filter((x) => !x.blank);
  assert.deepEqual(tm.map((x) => x.key), ["competitor_advances", "adoptable", "innovations_tracked"]);
  assert.deepEqual(tm.map((x) => x.l), ["Competitor advances", "Adoptable technologies", "Innovations tracked"]);
  assert.equal(tm[2].v, String(Object.values(d.innovations).reduce((n, r) => n + r.length, 0)), "innovations tracked counts innovations");
  assert.equal(t.title, "Technology Overview");
  assert.deepEqual(t.filters.map((f) => f.l), ["All", "Competitor Advancements", "Adoptable Advances"]);
  assert.deepEqual(t.tagWord, { rival: "", adopt: "Adoptable" });
  const mk = d.overviewConfig.market;
  assert.deepEqual(metricsFor(mk, "market", d).filter((x) => !x.blank).map((x) => x.l), ["Latest tenders", "Strong fits", "Tender value", "Perceived opportunities"]);
  assert.equal(mk.title, "Top opportunity");
  assert.deepEqual(mk.filters.map((f) => f.l), ["All", "Latest Tenders", "Perceived Opportunities"]);
  assert.deepEqual(mk.tagWord, { tender: "TENDER", opportunity: "OPPORTUNITY" });
  assert.deepEqual(mk.dirWord, {}, "no stance word on the market lane: the badge follows the card kind");
  ok("technology and market lanes: tiles, pills, groups and badge words are the stored rows");

  const names = marketMetrics(d.tenders, d).map((x) => x.l);
  assert.deepEqual(names, ["Active tenders", "Markets", "Source portals", "Value disclosed"]);
  assert.deepEqual(marketMetrics(d.tenders, {}).map((x) => x.l), [], "no ui.market_metric rows, no report tiles");
  ok("market report tiles are the ui.market_metric labels, bound by metric_id");
}

/* ---- rail and headings ---------------------------------------------------------------------------- */
{
  const names = (p) => railFor(p, fx).map((r) => r.label);
  assert.deepEqual(names("competitive"), ["Overview", "Competitor Profile", "Competitor Moment", "Products", "Product Evaluation", "Partnerships", "Projects", "Geo Footprint", "Patents"]);
  assert.deepEqual(names("market"), ["Top opportunity", "Tenders", "Global requirements", "Market Intelligence"], "market rail: stored labels in stored order");
  assert.deepEqual(names("technology"), ["Overview", "Innovations"], "the rail label is view_label; the page heading is page_heading");
  assert.equal(navTitle(fx, "technology", "innovation"), "Technology Innovation");
  assert.equal(navTitle(fx, "market", "tender"), "Tenders");
  assert.equal(railFor("competitive", { database: { ui: {} } }).length, 0, "no navigation rows, no rail items");
  const r = clone();
  r.database.ui.competitive_navigation = r.database.ui.competitive_navigation.filter((x) => x.view_key !== "geo");
  assert.equal(railFor("competitive", r).some((x) => x.view === "geo"), false, "a view with no row is not drawn");
  ok("the rail's words, order and headings are the navigation rows; a view with no row is not drawn");
}

/* ---- pillar names, Product Evaluation tabs, section titles ---------------------------------------- */
{
  setPillarNames(fx);
  assert.deepEqual([PILLAR_LABEL.competitive, PILLAR_LABEL.market, PILLAR_LABEL.technology], ["Competitive", "Market", "Technology"]);
  const r = clone();
  r.database.ui.market_pillar = [{ display_name: "Commerce" }];
  setPillarNames(r);
  assert.equal(PILLAR_LABEL.market, "Commerce", "the Market pillar name is the stored display_name");
  setPillarNames({});
  assert.equal(PILLAR_LABEL.market, "", "no stored name, no name");
  assert.equal(PILLAR_LABEL.technology, "");
  setPillarNames(fx);
  ok("pillar names Market and Technology are the stored names (Competitive is chrome: no ui table holds it)");
}

/* ---- no literal labels in the lane code, and no third stance anywhere ------------------------------ */
{
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(jsx?|css)$/.test(p) && !/\.test\./.test(p)) out.push(p);
    }
    return out;
  };
  const files = walk("src");
  const hit = files.filter((f) => /favou?rable/i.test(readFileSync(f, "utf-8")));
  assert.deepEqual(hit, [], `the word favourable appears in ${hit.join(", ")}`);
  const fav = files.filter((f) => /["'`.-]fav\b|\bfav["':]/.test(readFileSync(f, "utf-8")));
  assert.deepEqual(fav, [], `a fav stance is referenced in ${fav.join(", ")}`);
  const LITERALS = ["Competitive threats", "Watch signals", "Companies tracked", "Competitor advances", "Adoptable advances", "Domains tracked",
    "Latest tenders", "Strong fits", "Perceived opportunities", "Latest Tenders", "Perceived Opportunities", "Competitor Advancements",
    "Adoptable Advances", "Technology Knowledge", "Top opportunity", "Signals"];
  // the words the later pages read from their tables: none of them is a literal there either
  const PAGE_LITERALS = {
    "src/pages/market/Tenders.jsx": ["Country", "Category", "sorted by deadline", "No tenders match this filter", "No tenders served yet"],
    "src/components/tenderCockpit/TenderCockpit.jsx": ["Top tenders", "Projects to win before they tender", "Next moves"],
    "src/components/matchupDossier/MatchupDossier.jsx": ["Analytics", "Spec Comparison"],
    "src/components/detailPanel/DetailPanel.jsx": ["Demand in a client line", "Technology advance", "Competitor advance", "Tender"],
    "src/pages/market/GlobalRequirement.jsx": ["Global Requirements", "No requirements on record"],
    "src/lib/route.js": ["Market", "Technology"],
  };
  for (const [f, lits] of Object.entries(PAGE_LITERALS)) {
    const code = readFileSync(f, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const lit of lits) assert.ok(!code.includes(`"${lit}"`), `${f} carries the literal "${lit}"`);
  }
  for (const f of ["src/lib/overview.js", "src/lib/dataset.js", "src/lib/lanes.js", "src/pages/overview/Overview.jsx",
    "src/components/layout/Layout.jsx", "src/components/sidebar/Sidebar.jsx", "src/lib/route.js"]) {
    const code = readFileSync(f, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const lit of LITERALS) assert.ok(!code.includes(`"${lit}"`) && !code.includes(`'${lit}'`), `${f} carries the literal label "${lit}"`);
  }
  ok("no favourable stance anywhere in src; no literal tile / pill / heading label in the lane code");
}

console.log("\nok - labels, pills and tiles come from the database rows");

/* ---- I1: the Perceived opportunities tile counts the opportunity cards (kind), never a stance ------------ */
{
  const d = wireDataset(clone());
  const mk = d.overviewConfig.market;
  const opps = d.marketCards.filter((c) => c.kind === "opportunity");
  assert.ok(opps.length > 0, "the fixture carries pipeline opportunity cards");
  assert.ok(opps.every((c) => !c.dir), "market cards carry no stance, so the tile cannot depend on one");
  const tile = metricsFor(mk, "market", d).find((x) => x.key === "perceived_opportunities");
  assert.ok(tile, "the stored tile is drawn");
  const served = mk.cards.filter((c) => c.kind === "opportunity");
  assert.ok(served.length > 0, "the opportunity lane is not empty on the fixture");
  assert.equal(tile.v, String(served.length), "the tile counts the opportunity cards it names");
  assert.equal(mk.cards.filter(tilePredicate("opps")).length, served.length, "its door opens exactly those cards");
  assert.equal(mk.cards.filter((c) => filterMatch(c, "opps", mk.filters)).length, served.length, "and so does the pill");
  ok("Perceived opportunities tile counts the opportunity cards (" + served.length + " > 0 on the fixture)");
}

/* ---- I2: Innovation maturity / position words, list heading and Geo dropdown labels are stored rows ----- */
{
  const strip = (f) => readFileSync(f, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ivs = Object.values(fx.innovations).flat();
  assert.ok(ivs.length > 0);
  for (const iv of ivs) {
    assert.equal(maturityWord(iv), iv.matLabel, "the maturity word is the stored maturity_label");
    assert.equal(positionWord(iv), iv.gapLabel, "the position word is the stored position_label");
  }
  assert.ok(ivs.some((x) => x.mat === "fielded" && maturityWord(x) === "Fielded"), "Fielded reads as stored, not as a browser map's 'Fielded / in service'");
  const renamed = { ...ivs[0], matLabel: "Stored word", gapLabel: "Stored position" };
  assert.equal(maturityWord(renamed), "Stored word");
  assert.equal(positionWord(renamed), "Stored position");
  assert.equal(maturityLabel({ mat: null }), "not stated");
  assert.equal(positionWord({ gap: null }), "");
  assert.equal(uiText(fx, "ui.technology_innovation_view", {}, "list_heading"), "Innovations in this category");
  assert.equal(uiText(fx, "ui.technology_innovation_view", {}, "empty_state_text"), "No innovations on record for this category.");
  const g = (type, col) => uiText(fx, "ui.competitive_geo_filter", { filter_type: type, selected_value: "all" }, col);
  assert.deepEqual([g("company", "filter_label"), g("company", "option_label"), g("country", "filter_label"), g("country", "option_label")],
    ["Company", "All companies", "Country", "All countries"]);
  const inno = strip("src/pages/technology/Innovation.jsx");
  assert.ok(!/MAT_LAB|GAP_LAB/.test(inno + strip("src/lib/innovation.js")), "no maturity / position map left in code");
  assert.ok(!/["'`>]\s*Innovations\s*["'`<]|· Innovations/.test(inno), "the Innovation list heading is not a literal");
  assert.ok(inno.includes("technology_innovation_view"), "the Innovation page reads ui.technology_innovation_view");
  const geo = strip("src/pages/competitive/Geo.jsx");
  assert.ok(!/ddlbl">\s*(Competitor|Country)\s*</.test(geo), "the Geo dropdown labels are not literals");
  assert.ok(!/country \|\| "All"|: "All";/.test(geo), "the Geo 'all' options are not literals");
  assert.ok(geo.includes("competitive_geo_filter"), "Geo reads ui.competitive_geo_filter");
  ok("Innovation maturity / position / heading / empty text and Geo dropdown labels read the stored rows");
}
