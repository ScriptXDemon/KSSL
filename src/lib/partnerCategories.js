/* PARTNERSHIP CATEGORIES: every kind of tie a rival can have, one place.

   The dataset's own vocabulary is `rel` (REL_LABEL: dist, dealer, oem ...). The graph knew six
   defence-era keys (tech, supply, jv, mou, acq, other), so a genset rival's distributors, dealers,
   packagers, rental fleets, service partners and key accounts all fell into "Other" -- 13 of
   Caterpillar's 14 ties. Each category here has a colour, a group and a plain-language `def`
   saying what the tie IS, so a reader can tell a distributor from a customer without the notes.
   `{C}` in a definition is the rival's name. Order is the order the graph and legend list them. */

export const CATEGORY_GROUPS = [
  { key: "channel", label: "Channel & distribution" },
  { key: "supply", label: "Supply chain" },
  { key: "tech", label: "Technology & strategy" },
  { key: "buyer", label: "Buyers & customers" },
];

export const PARTNER_CATEGORIES = [
  { key: "dist", group: "channel", label: "Exclusive distributor", color: "#e0a020", fill: "#3a2f15",
    def: "Sells, stocks and services {C}'s products in an assigned territory as its appointed distributor: {C}'s route to market there." },
  { key: "dealer", group: "channel", label: "Dealer", color: "#f0b95a", fill: "#3b2d14",
    def: "Authorised to sell and service {C}'s products; one of the channels {C} uses in the territory." },
  { key: "packager", group: "channel", label: "Packager", color: "#d98c3f", fill: "#3b2616",
    def: "Builds complete generator sets around {C}'s engines (often beside other brands) and sells them under its own or {C}'s name." },
  { key: "rental", group: "channel", label: "Rental fleet supply", color: "#c9a227", fill: "#352c10",
    def: "Holds {C}'s equipment in a rental fleet. Rentals seed accounts that later convert to permanent purchases." },
  { key: "oem", group: "supply", label: "OEM engine supply", color: "#5b9bd5", fill: "#1d3147",
    def: "Engines or major components move between the two companies: one builds the other's product in." },
  { key: "supply", group: "supply", label: "Supply / customer", color: "#4a86c5", fill: "#1b2f45",
    def: "Buys from or sells to {C} on ordinary commercial supply terms." },
  { key: "framework", group: "supply", label: "Framework supplier", color: "#6fb1e0", fill: "#1d3550",
    def: "A multi-unit or multi-year supply agreement: a block of {C}'s equipment, or a programme, is committed to this party." },
  { key: "local", group: "supply", label: "Localization partner", color: "#3fa8a0", fill: "#17383a",
    def: "Licensed or equipped to make, assemble or source {C}'s products inside the country, which counts toward local-content rules." },
  { key: "service", group: "supply", label: "Service partner", color: "#58b5c9", fill: "#173640",
    def: "Maintains, repairs and supplies parts for {C}'s installed fleet in its territory." },
  { key: "tech", group: "tech", label: "Technology / licence", color: "#a58af0", fill: "#2c2447",
    def: "A technology, licence or product-development tie that gives {C} (or the partner) a capability the other supplies." },
  { key: "jv", group: "tech", label: "Joint venture", color: "#3fa86a", fill: "#1d3a2b",
    def: "A jointly owned company with shared investment and control." },
  { key: "acq", group: "tech", label: "Acquisition / stake", color: "#b266c9", fill: "#3a2347",
    def: "{C} owns, or has bought into, the other party (or the reverse)." },
  { key: "mou", group: "tech", label: "MoU / strategic", color: "#b8b8c0", fill: "#2a2a30",
    def: "A memorandum or strategic agreement: stated intent to cooperate, not yet a supply, licence or ownership contract." },
  { key: "account", group: "buyer", label: "Key account", color: "#e0705a", fill: "#40201a",
    def: "A named end customer that buys {C}'s equipment: the buyer in the relationship." },
  { key: "other", group: "tech", label: "Other", color: "#9aa0aa", fill: "#2a2a30",
    def: "A tie the source records without classifying its type." },
];

const BY_KEY = Object.fromEntries(PARTNER_CATEGORIES.map((c) => [c.key, c]));

export const categoryOf = (rel) => BY_KEY[rel] || BY_KEY.other;

/* the category's definition with the rival named */
export const categoryDef = (rel, rival) => categoryOf(rel).def.replace(/\{C\}/g, rival || "the rival");

/* every category with how many of `rows` fall in it (zero kept, so the whole taxonomy shows) */
export function categoryCounts(rows, keyOf = (r) => r) {
  const n = {};
  (rows || []).forEach((r) => {
    const k = categoryOf(r && r.rel).key;
    const id = keyOf(r);
    (n[k] = n[k] || new Set()).add(id);
  });
  return PARTNER_CATEGORIES.map((c) => ({ ...c, n: n[c.key] ? n[c.key].size : 0 }));
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

/* "[CORE]" / "[ADJACENT]" tag the export puts at the start of `insight`: how close the tie is to
   the client's own business. */
export function closenessOf(insight) {
  const m = /\[(CORE(?: OVERLAP)?|ADJACENT|CONTEXT|OVERLAP)\]/i.exec(String(insight || ""));
  if (!m) return null;
  return /core|overlap/i.test(m[1]) ? "Core overlap" : /adjacent/i.test(m[1]) ? "Adjacent" : "Context";
}

if (typeof process !== "undefined" && process.argv && /partnerCategories\.js$/.test(process.argv[1] || "")) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  assert(new Set(PARTNER_CATEGORIES.map((c) => c.key)).size === PARTNER_CATEGORIES.length, "duplicate key");
  assert(categoryOf("nonsense").key === "other", "unknown rel -> other");
  assert(verdictOf("<b>Threat:</b> x") === "Threat" && verdictOf("<b>Watch:</b> y") === "Watch" && verdictOf("plain") === null, "verdict");
  assert(meanText("<b>Watch:</b> Cat holds it. <span style='opacity:.6'>· <a href='u'>source</a></span>") === "Cat holds it.", "meanText");
  assert(closenessOf("<b>[CORE]</b> x") === "Core overlap" && closenessOf("[ADJACENT] x") === "Adjacent", "closeness");
  console.log("partnerCategories ok");
}
