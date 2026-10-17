/* THE SCREEN'S FURNITURE: words and structure that belong to the front end, not to the database.

   Navigation, pillar names, page headings, tabs, tile labels, time windows, filter controls and their option lists
   are code, defined here exactly as the reference UI defines them (neutral wording, nothing client- or
   product-specific). The database holds the DATA only (the serving tables): every fact, name, number, date and
   judgement on a card comes from the dataset, never from this file. A filter here compares an option CODE against
   the tag value stored on the rows (stance, kind, country, category, ...); the options list is chrome, the values
   it matches are data.

   Stances: threat and watch are the only two. A row stored under any other value has no stance.

   Pure -- no React, no window -- so the tests drive it directly. */

/* ---- stances ------------------------------------------------------------------------------------------------ */
export const STANCES = ["threat", "watch"];
export const STANCE_WORD = { threat: "Threat", watch: "Watch" };
/* the stance filter options, in menu order: [{code, label}] */
export const STANCE_OPTIONS = STANCES.map((code) => ({ code, label: STANCE_WORD[code] }));
/* A card's stance, or "": only threat or watch count. Anything else has no stance. */
export const stanceOf = (dir) => (STANCES.includes(dir) ? dir : "");
/* the stance words as a fresh object: { threat: "Threat", watch: "Watch" } */
export const stanceWords = () => ({ ...STANCE_WORD });

/* ---- the three overview lanes --------------------------------------------------------------------------------- */
export const COMPETITIVE_TITLE = "Competitive Intelligence";
const ALL_PILL = "All";
const SLOTS = 5; // the metric strip is a grid of five equal columns; unused slots are drawn empty
const STANCE_COLOR = { threat: "var(--threat)", watch: "var(--watch)" };

/* tiles padded with empty slots so the grid keeps its column widths */
const withBlanks = (tiles) => {
  const out = tiles.slice();
  for (let i = 0; out.length < SLOTS; i += 1) out.push({ blank: true, key: `blank-${i}`, l: "", act: "all" });
  return out;
};

/* A tile is bound to its count by KEY (never by its label text); `act` is the filter the tile opens. */
export function competitiveLane() {
  return {
    title: COMPETITIVE_TITLE,
    metrics: withBlanks([
      { key: "threats", l: "Competitive threats", act: "threat" },
      { key: "watch", l: "Watch signals", act: "watch" },
      { key: "companies_tracked", l: "Companies tracked", act: "all" },
    ]),
    filters: [{ f: "all", l: ALL_PILL }, ...STANCES.map((s) => ({ f: s, l: STANCE_WORD[s], c: STANCE_COLOR[s] }))],
    dirWord: stanceWords(),
  };
}

export function technologyLane() {
  return {
    title: "Technology Knowledge",
    metrics: withBlanks([
      { key: "competitor_advances", l: "Competitor advances", act: "rival" },
      { key: "adoptable", l: "Adoptable advances", act: "adopt" },
      { key: "domains_tracked", l: "Domains tracked", act: "all" },
    ]),
    filters: [
      { f: "all", l: ALL_PILL },
      { f: "rival", l: "Competitor Advancements", tag: "rival", c: "var(--threat)" },
      { f: "adopt", l: "Adoptable Advances", tag: "adopt", c: "var(--watch)" },
    ],
    groups: [
      { h: "Competitor Advancements", tags: ["rival"] },
      { h: "Adoptable Advances", tags: ["adopt"] },
    ],
    /* only ADOPTABLE is labelled on a row; a competitor row carries no badge */
    tagWord: { rival: "", adopt: "Adoptable" },
    dirWord: {},
  };
}

export function marketLane() {
  return {
    title: "Top opportunity",
    metrics: withBlanks([
      { key: "latest_tenders", l: "Latest tenders", act: "open" },
      { key: "strong_fits", l: "Strong fits", act: "fit" },
      { key: "tender_value", l: "Tender value", act: "valued" },
      { key: "perceived_opportunities", l: "Perceived opportunities", act: "opps" },
    ]),
    filters: [
      { f: "all", l: ALL_PILL },
      { f: "tenders", l: "Latest Tenders", kinds: ["tender"], c: "var(--threat)" },
      { f: "opps", l: "Perceived Opportunities", kinds: ["opportunity"], c: "var(--watch)" },
    ],
    groups: [
      { h: "Latest Tenders", kinds: ["tender"] },
      { h: "Perceived Opportunities", kinds: ["opportunity"] },
    ],
    /* a tender is marked by its `kind`, not by a stance */
    tagWord: { tender: "TENDER", opportunity: "OPPORTUNITY" },
    dirWord: {},
  };
}

/* ---- the detail panel ---------------------------------------------------------------------------------------- */
/* the badge word of a promoted tender */
export const TENDER_WORD = "Tender";

/* ---- Competitor Moment ----------------------------------------------------------------------------------------- */
/* [key, label, days back from the newest move]; null days = every date */
export const MOMENT_PRESETS = [["today", "Today", 0], ["week", "Week", 6], ["month", "Month", 29], ["all", "All", null]];

/* A moment's stored level -> the stance it draws: a level read as a threat ("high", "threat") or a watch gives that
   stance; any other level (or none) gives "" and draws no pill. */
export function momentStance(level) {
  const v = String(level == null ? "" : level).trim().toLowerCase();
  if (v === "high" || v === "threat") return "threat";
  if (v === "watch") return "watch";
  return "";
}

/* ---- Market Intelligence tabs ------------------------------------------------------------------------------------ */
export const MARKET_SECTIONS = [
  { id: "outlook", label: "Market outlook" },
  { id: "active", label: "Number of active tenders" },
  { id: "category", label: "By category" },
  { id: "awarded", label: "Awarded" },
  { id: "closed", label: "Closed" },
];

/* ---- Projects: filter, sequence ------------------------------------------------------------------------------------ */
/* the filter options compare against the stored `region` of a project row */
export const PROJECT_FILTERS = [
  { f: "Domestic", l: "Domestic" },
  { f: "Export", l: "Export" },
];
export const PROJECT_SEQ = [
  ["recent", "Most recent milestone"],
  ["stage", "Furthest along"],
];
export const PROJECT_SEQ_DEFAULT = "recent";

/* ---- Market tiles (Tenders / Market Intelligence strip) ------------------------------------------------------------------ */
export const MARKET_TILE_LABEL = {
  "active-tenders": "Active tenders",
  markets: "Markets",
  "source-portals": "Source portals",
  "value-disclosed": "Value disclosed",
};
