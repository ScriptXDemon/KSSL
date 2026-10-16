/* PARTNERSHIP CATEGORIES: every kind of tie a rival can have, read from the dataset.

   The legend is ui.partner_category (data.database.ui.partner_category): category_key is the slug of the
   stored partner_type, with its group, label, short label, a definition and the overlap kind it belongs to.
   A definition may contain {rival} and {client}: joins of dataset values, filled in here. Only the colours
   are code: a neutral palette indexed by display order, so a colour means the same thing in the legend,
   the graph and the cards. No category, label or definition is written in this file. */

/* line colour and fill, by position in the legend */
const PALETTE = [
  ["#e0a020", "#3a2f15"], ["#f0b95a", "#3b2d14"], ["#d98c3f", "#3b2616"], ["#c9a227", "#352c10"],
  ["#5b9bd5", "#1d3147"], ["#4a86c5", "#1b2f45"], ["#6fb1e0", "#1d3550"], ["#3fa8a0", "#17383a"],
  ["#58b5c9", "#173640"], ["#a58af0", "#2c2447"], ["#3fa86a", "#1d3a2b"], ["#b266c9", "#3a2347"],
  ["#b8b8c0", "#2a2a30"], ["#e0705a", "#40201a"], ["#9aa0aa", "#2a2a30"],
];
const NEUTRAL = ["#9aa0aa", "#2a2a30"];

const fill = (text, rival, client) =>
  String(text == null ? "" : text).replace(/\{rival\}/g, rival || "").replace(/\{client\}/g, client || "");

/* The categories of one dataset. `rel` on a partner row is the category key. */
export function buildCategories(d) {
  const rows = ((d && d.database && d.database.ui && d.database.ui.partner_category) || [])
    .filter((r) => r && r.category_key)
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const list = rows.map((r, i) => {
    const [color, fillColor] = PALETTE[i % PALETTE.length];
    return {
      key: r.category_key, group: r.group_key, groupLabel: r.group_label, label: r.category_label || "",
      short: r.short_label || "", def: r.definition || "", overlapKind: r.overlap_kind || "", color, fill: fillColor,
    };
  });
  const byKey = Object.fromEntries(list.map((c) => [c.key, c]));
  const groups = [];
  list.forEach((c) => { if (c.group && !groups.some((g) => g.key === c.group)) groups.push({ key: c.group, label: c.groupLabel || "" }); });
  /* a tie type the legend does not list gets a neutral entry with no label or definition of its own */
  const categoryOf = (rel) => byKey[rel] || { key: rel || "", group: "", label: "", short: "", def: "", overlapKind: "", color: NEUTRAL[0], fill: NEUTRAL[1] };
  const categoryDef = (rel, rival, client) => fill(categoryOf(rel).def, rival, client);
  /* every category with how many of `rows` fall in it (zero kept, so the whole legend shows) */
  function categoryCounts(items, keyOf = (r) => r) {
    const n = {};
    (items || []).forEach((r) => {
      const k = r && r.rel;
      if (!byKey[k]) return;
      (n[k] = n[k] || new Set()).add(keyOf(r));
    });
    return list.map((c) => ({ ...c, n: n[c.key] ? n[c.key].size : 0 }));
  }
  return { list, groups, categoryOf, categoryDef, categoryCounts, fill };
}

/* The analyst's verdict on a tie for the client, read off the start of `mean`
   ("<b>Threat:</b> ...", "<b>Watch:</b> ...", "<b>Opportunity:</b> ..."). null when unstated. */
export function verdictOf(mean) {
  const m = /^\s*(?:<b>)?\s*(Threat|Watch|Opportunity)\s*:/i.exec(String(mean || ""));
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

/* `mean` without its leading label and trailing source link, as plain text */
export function meanText(mean) {
  return String(mean || "")
    .replace(/<span[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/^\s*(?:<b>)?\s*(Threat|Watch|Opportunity)\s*:\s*(?:<\/b>)?\s*/i, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
