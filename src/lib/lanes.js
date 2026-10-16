/* THE THREE OVERVIEW LANES, built from the database.

   backend/areas/*.py ships overviewConfig.<lane> empty (no English from the backend, ruling R12). The words on a
   lane -- its metric tiles, its filter pills, its group headings, its card badges -- are rows of ui / serving
   tables and are read here with uiText.js:

     competitive   tiles   ui.competitive_metric (metric_key threats | watch | companies_tracked)
                   pills   ui.filter_option group 'stance' (threat, watch)
     market        tiles   ui.market_top_opportunity_view (four fixed label columns)
                   pills   ui.filter_option group 'market-feed'
     technology    tiles   serving.technology_metric (metric_key competitor_advances | adoptable | innovations_tracked)
                   pills   ui.filter_option group 'technology-feed'

   A tile or pill whose row or label is missing is not drawn; a lane with no rows has no strip and no pills. A tile
   is bound to its count by KEY (metric_key / the column it came from), never by its label text, so a label can be
   edited in the database without breaking a count. The only literals are chrome: the word "All" on the reset pill,
   the lane heading of the competitive overview (no table holds it, MAPPING E), and the tile-strip slot count. */
import { uiList, uiRows, uiText, filterOptions, stanceWords, STANCES } from "./uiText.js";

export const COMPETITIVE_TITLE = "Competitive Intelligence";
const ALL_PILL = "All";
const SLOTS = 5; // the metric strip is a grid of five equal columns; unused slots are drawn empty
const STANCE_COLOR = { threat: "var(--threat)", watch: "var(--watch)" };

/* tiles padded with empty slots so the grid keeps its column widths; no tile at all -> no strip */
const withBlanks = (tiles) => {
  if (!tiles.length) return [];
  const out = tiles.slice();
  for (let i = 0; out.length < SLOTS; i += 1) out.push({ blank: true, key: `blank-${i}`, l: "", act: "all" });
  return out;
};

export function competitiveLane(d) {
  const ACT = { threats: "threat", watch: "watch", companies_tracked: "all" };
  const tiles = uiList(d, "ui.competitive_metric", {}, "display_order")
    .filter((r) => ACT[r.metric_key] && String(r.metric_label || "").trim())
    .map((r) => ({ key: r.metric_key, l: String(r.metric_label).trim(), act: ACT[r.metric_key] }));
  const stance = filterOptions(d, "stance").filter((o) => STANCES.includes(o.code));
  return {
    title: COMPETITIVE_TITLE,
    metrics: withBlanks(tiles),
    filters: stance.length
      ? [{ f: "all", l: ALL_PILL }, ...stance.map((o) => ({ f: o.code, l: o.label, c: STANCE_COLOR[o.code] }))]
      : [],
    dirWord: stanceWords(d),
  };
}

export function technologyLane(d) {
  const ACT = { competitor_advances: "rival", adoptable: "adopt", innovations_tracked: "all" };
  const tiles = uiList(d, "serving.technology_metric", {}, "display_order")
    .filter((r) => ACT[r.metric_key] && String(r.metric_label || "").trim())
    .map((r) => ({ key: r.metric_key, l: String(r.metric_label).trim(), act: ACT[r.metric_key] }));
  const opts = filterOptions(d, "technology-feed");
  const rival = opts.find((o) => o.code === "competitor-advances");
  const adopt = opts.find((o) => o.code === "adoptable");
  const filters = [];
  if (rival) filters.push({ f: "rival", l: rival.label, tag: "rival", c: "var(--threat)" });
  if (adopt) filters.push({ f: "adopt", l: adopt.label, tag: "adopt", c: "var(--watch)" });
  const tagWord = {};
  if (rival) tagWord.rival = rival.badge;
  if (adopt) tagWord.adopt = adopt.badge;
  return {
    title: uiText(d, "ui.technology_ui_view", { view_key: "overview" }, "page_heading"),
    metrics: withBlanks(tiles),
    filters: filters.length ? [{ f: "all", l: ALL_PILL }, ...filters] : [],
    groups: [rival && { h: rival.label, tags: ["rival"] }, adopt && { h: adopt.label, tags: ["adopt"] }].filter(Boolean),
    tagWord,
    dirWord: {},
  };
}

export function marketLane(d) {
  const view = uiRows(d, "ui.market_top_opportunity_view")[0] || {};
  const COLS = [
    ["latest_tenders", "latest_tenders_metric_label", "open"],
    ["strong_fits", "strong_fits_metric_label", "fit"],
    ["tender_value", "tender_value_metric_label", "valued"],
    ["perceived_opportunities", "perceived_opportunities_metric_label", "opps"],
  ];
  const tiles = COLS.filter(([, col]) => String(view[col] || "").trim()).map(([key, col, act]) => ({
    key, l: String(view[col]).trim(), act,
  }));
  const opts = filterOptions(d, "market-feed");
  const tenders = opts.find((o) => o.code === "tenders");
  const opps = opts.find((o) => o.code === "opportunities");
  const filters = [];
  if (tenders) filters.push({ f: "tenders", l: tenders.label, kinds: ["tender"], c: "var(--threat)" });
  if (opps) filters.push({ f: "opps", l: opps.label, dirs: ["watch"], c: "var(--watch)" });
  const tagWord = {};
  if (tenders) tagWord.tender = tenders.badge;
  return {
    title: String(view.page_heading || "").trim(),
    metrics: withBlanks(tiles),
    filters: filters.length ? [{ f: "all", l: ALL_PILL }, ...filters] : [],
    groups: [tenders && { h: tenders.label, kinds: ["tender"] }, opps && { h: opps.label, dirs: ["watch"] }].filter(Boolean),
    tagWord,
    dirWord: opps && opps.badge ? { watch: opps.badge } : {},
  };
}
