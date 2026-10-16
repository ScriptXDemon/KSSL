/* LABELS FROM THE DATABASE.

   Every word on a pill, a tile, a tab, a heading or a rail item that docs/ui_port/MAPPING.md section E maps to a
   ui / serving column is read here, from the rows /api/dataset already ships in data.database.<schema>.<table>.
   A missing table, row or cell gives "" -- never a literal. The caller then draws nothing (no pill, no tile, no
   tab) or the component's own empty state; there is no default word.

   Pure -- no React, no window -- so the tests drive it directly. */

/* the rows of "ui.competitive_metric" (schema.table); [] when the table is absent */
export function uiRows(data, qualified) {
  const [schema, table] = String(qualified).split(".");
  const rows = data && data.database && data.database[schema] && data.database[schema][table];
  return Array.isArray(rows) ? rows : [];
}

const text = (v) => (v == null ? "" : String(v).trim());

/* One cell: the first row whose columns equal every pair of `where`, its `col`; "" when there is none. */
export function uiText(data, qualified, where, col) {
  const w = Object.entries(where || {});
  const row = uiRows(data, qualified).find((r) => r && w.every(([k, v]) => r[k] === v));
  return row ? text(row[col]) : "";
}

/* The rows of one table that match `where`, ordered by `orderCol` (ascending, stable). */
export function uiList(data, qualified, where, orderCol) {
  const w = Object.entries(where || {});
  const rows = uiRows(data, qualified).filter((r) => r && w.every(([k, v]) => r[k] === v));
  if (!orderCol) return rows.slice();
  return rows
    .map((r, i) => [r, i])
    .sort((a, b) => (Number(a[0][orderCol]) || 0) - (Number(b[0][orderCol]) || 0) || a[1] - b[1])
    .map((x) => x[0]);
}

/* The options of one filter group of ui.filter_option, in stored order: [{code, label, badge}].
   Labels with no text are dropped: an option with no word is not drawn. */
export function filterOptions(data, group) {
  return uiList(data, "ui.filter_option", { filter_group: group }, "display_order")
    .map((r) => ({ code: text(r.option_code), label: text(r.option_label), badge: text(r.badge_label) }))
    .filter((o) => o.code && o.label);
}

/* The stance words: { threat: "Threat", watch: "Watch" } as stored. A stance is threat or watch and nothing
   else, so a row stored under any other code is not a stance and is not returned. */
export const STANCES = ["threat", "watch"];
export function stanceWords(data) {
  const out = {};
  filterOptions(data, "stance").forEach((o) => {
    if (STANCES.includes(o.code)) out[o.code] = o.badge || o.label;
  });
  return out;
}
/* A card's stance, or "" : only threat or watch count. Anything else (a legacy value) has no stance. */
export const stanceOf = (dir) => (STANCES.includes(dir) ? dir : "");
