/* The route: which pillar, which view, and how that reads to and from the URL hash.
 *
 * Pure -- no window, no React -- so test_route.mjs can pin it under node. AppState
 * owns the history calls; this file owns what a hash MEANS.
 *
 * Before this the router wrote every navigation with history.replaceState, listened to
 * nothing, and validated the pillar but never the view. Three things followed, all
 * found by driving the built app (2026-09-05): Back left the site because the session
 * had one history entry; a hash edited in the address bar of an open tab changed
 * nothing; and #v=does-not-exist rendered the rail beside an empty pane -- then saved
 * that route to localStorage, so it came back on every reload. */

import { viewVisible, firstVisibleView } from "./visibility.js";
import { uiText, uiRows } from "./uiText.js";

export const PILLARS = ["competitive", "market", "technology"];
/* The pillar names: Market and Technology are stored (ui.market_pillar.display_name, ui.technology_pillar.pillar_name),
   set from the dataset by setPillarNames before anything renders (like visibility). No ui table holds the Competitive
   name (ui.competitive_pillar carries the account, brand and the active-pillar code), so it is chrome. A name the
   database does not hold is empty, never a literal. */
export const PILLAR_LABEL = {
  competitive: "Competitive",
  market: "",
  technology: "",
};
export function setPillarNames(data) {
  PILLAR_LABEL.market = uiRows(data, "ui.market_pillar")[0] ? String(uiRows(data, "ui.market_pillar")[0].display_name || "").trim() : "";
  PILLAR_LABEL.technology = uiRows(data, "ui.technology_pillar")[0] ? String(uiRows(data, "ui.technology_pillar")[0].pillar_name || "").trim() : "";
}

/* Which rail item each pillar opens on, and the pillar each rail belongs to. */
/* The rail's WORDS are database rows, not literals: `nav` is the row key in the pillar's navigation table (NAV
   below), and the label, the order and the page heading are that row's columns (read by railFor / navTitle with
   uiText). A view with no row, or no label in it, is not drawn. Only the route (view id), its index glyph and the
   overview flag live here. */
export const RAIL = {
  /* `gap-competitive` is ARCHIVED, not deleted: it is off the rail but Layout still
     routes it, so a saved route or a pasted #v=gap-competitive link still resolves.
     Same for `awarded-tenders` / `closed-tenders`, which the Market overview now
     carries as tabs. */
  competitive: [
    { view: "overview", nav: "overview", ix: "grid", overview: true },
    { view: "profile", nav: "profile", ix: "01" },
    { view: "threat-analysis", nav: "moment", ix: "02" },
    { view: "products", nav: "products", ix: "03" },
    { view: "positioning", nav: "evaluation", ix: "04" },
    { view: "partnerships", nav: "partnerships", ix: "05" },
    { view: "projects", nav: "projects", ix: "06" },
    { view: "geo", nav: "geo", ix: "07" },
    { view: "patents-comp", nav: "patents", ix: "08" },
  ],
  market: [
    { view: "m-overview", nav: "top-opportunity", ix: "grid", overview: true },
    { view: "tender", nav: "tenders", ix: "01" },
    { view: "global-requirement", nav: "global-requirement", ix: "02" },
    { view: "m-report", nav: "market-intelligence", ix: "03" },
  ],
  technology: [
    { view: "t-overview", nav: "overview", ix: "grid", overview: true },
    { view: "innovation", nav: "innovation", ix: "01" },
  ],
};

/* where each pillar's navigation words live */
const NAV = {
  competitive: { table: "ui.competitive_navigation", key: "view_key", label: "view_label", order: "view_sequence", heading: "view_label" },
  market: { table: "ui.market_view", key: "view_id", label: "rail_label", order: "rail_order", heading: "view_title" },
  technology: { table: "ui.technology_ui_view", key: "view_key", label: "view_label", order: "display_order", heading: "page_heading" },
};

/* a view's page heading, from its navigation row; "" when there is none */
export function navTitle(data, pillar, view) {
  const item = (RAIL[pillar] || []).find((r) => r.view === view);
  const n = NAV[pillar];
  return item && n ? uiText(data, n.table, { [n.key]: item.nav }, n.heading) : "";
}

/* Views Layout still renders that are on no rail. */
export const ARCHIVED_VIEWS = {
  competitive: ["gap-competitive", "threat_analysis", "project", "finance", "finances"],
  market: ["awarded-tenders", "closed-tenders"],
  technology: [],
};

/* The signal-feed view of each pillar. The global search routes a signal here, and
   the feed takes its pending payload under this name -- ONE table, so the two cannot
   disagree (they did: the feed asked for "overview" on all three pillars). */
export const OVERVIEW_VIEW = {
  competitive: "overview",
  market: "m-overview",
  technology: "t-overview",
};

export const DEFAULT_ROUTE = { pillar: "competitive", view: "overview" };

const VIEWS_OF = {};
PILLARS.forEach((p) => {
  VIEWS_OF[p] = new Set(RAIL[p].map((r) => r.view).concat(ARCHIVED_VIEWS[p] || []));
});

/* The rail a reader sees: items whose section the database has switched off are left out. With the dataset, each
   item also carries its stored label and is placed by its stored order (the overview stays first); an item with no
   label in the navigation table is not drawn, and the index glyphs follow the order. Without the dataset (route
   tests) it is the visible routes alone. */
export function railFor(pillar, data) {
  const items = (RAIL[pillar] || []).filter((r) => viewVisible(r.view));
  const n = NAV[pillar];
  if (!data || !n) return items;
  const rows = uiRows(data, n.table);
  const withLabel = items
    .map((r, i) => {
      const row = rows.find((x) => x && x[n.key] === r.nav);
      const label = row && row[n.label] != null ? String(row[n.label]).trim() : "";
      return { ...r, label, _order: row ? Number(row[n.order]) || 0 : 0, _i: i };
    })
    .filter((r) => r.label);
  const head = withLabel.filter((r) => r.overview);
  const rest = withLabel.filter((r) => !r.overview).sort((a, b) => a._order - b._order || a._i - b._i);
  return head.concat(rest.map((r, i) => ({ ...r, ix: String(i + 1).padStart(2, "0") })));
}

export function isKnownView(view, pillar) {
  if (pillar) return !!(VIEWS_OF[pillar] && VIEWS_OF[pillar].has(view));
  return PILLARS.some((p) => VIEWS_OF[p].has(view));
}

export function routeHash(pillar, view) {
  return `#p=${encodeURIComponent(pillar)}&v=${encodeURIComponent(view)}`;
}

/* A hash -> { pillar, view, repaired } or null.

   null means the hash carries no route (empty, foreign, or an unknown pillar): the
   caller falls back to its saved route or the default. An unknown or HIDDEN view on a
   known pillar is repaired to that pillar's first visible view and flagged, so the shell never boots
   into a pane its switch cannot render. */
export function parseRoute(hash) {
  const raw = String(hash == null ? "" : hash).replace(/^#/, "");
  if (!raw || !raw.includes("p=")) return null;
  let params;
  try {
    params = new URLSearchParams(raw);
  } catch (e) {
    return null;
  }
  const p = params.get("p");
  const v = params.get("v");
  if (!p || !v || !PILLARS.includes(p)) return null;
  if (isKnownView(v, p) && viewVisible(v)) return { pillar: p, view: v, repaired: false };
  return { pillar: p, view: firstVisibleView(p), repaired: true };
}
