/* The Products sidebar's revenue facet, built from the roster like its two
   neighbours (lib/countryFacet.js).

   It used to be three fixed options -- High / Mid / Emerging -- over a roster on
   which serving.competitors.revenue_filter is null for every row (measured
   2026-09-05: 0 of 42 live, 0 of 28 sample). Each option emptied the list. The
   options now come from the rows, each with its count; with no tier on file there
   are none, and the page draws no control rather than a dead one. */
import { facetOptions } from "./countryFacet.js";

/* The house wording for the tiers the pipeline is specified to write. A value
   outside this set is still offered, under its own name: the facet reports the
   data, it does not censor it. */
export const REVENUE_LABEL = {
  high: "High (≥ ₹5,000 Cr)",
  mid: "Mid (₹1,000 - ₹5,000 Cr)",
  emerging: "Emerging (< ₹1,000 Cr)",
  unknown: "Revenue not on record",
};

/* ₹ crore per 1 billion of each currency -- rough, stable-enough rates: the tiers are
   bands a factor of five apart, so a few percent of FX drift never moves a company. */
const CRORE_PER_BN = { usd: 8500, eur: 9300, gbp: 11000, inr: 100, cny: 1200, jpy: 57, sek: 800 };
const CUR = [["usd", /\$|usd|us\$/], ["eur", /€|eur/], ["gbp", /£|gbp/], ["cny", /rmb|cny|yuan/], ["jpy", /yen|jpy|¥/], ["sek", /sek/]];

/* "₹1,128 crore (demo)" / "Rs 1.2 lakh crore" / "$4.7 billion" / "€850 million" -> ₹ crore,
   or null when the text carries no revenue amount this can read. Three ways the old reader
   got a tier wrong, all measured on the live roster: it stopped at the first number, so
   "FY2025 sales ... USD 67.6 billion" read "2025" and Caterpillar had no tier; it knew no
   RMB or yen, so those counted as rupees; and "Not published separately; capital 5,000
   million yen" put Mitsubishi in "Emerging" on its share capital. A text that says the
   figure is not disclosed has no figure, even when it names a parent group's. */
export function revenueCrore(text) {
  const t = String(text || "").toLowerCase().replace(/,/g, "");
  if (/^\s*not (disclosed|published|available)/.test(t)) return null;
  for (const m of t.matchAll(/(₹|rs\.?|inr|\$|usd|us\$|€|eur|£|gbp|rmb|cny|¥|jpy|sek)?\s*(\d+(?:\.\d+)?)\s*(lakh\s*crore|crore|cr\b|billion|bn\b|b\b|million|mn\b|m\b)/g)) {
    const n = parseFloat(m[2]);
    const unit = m[3];
    if (/lakh/.test(unit)) return n * 100000;
    if (/crore|cr/.test(unit)) return n;                                 // crore is always ₹
    const here = (m[1] || "") + t.slice(m.index + m[0].length, m.index + m[0].length + 6);
    const cur = (CUR.find(([, re]) => re.test(m[1] || "")) || CUR.find(([, re]) => re.test(here)) || ["inr"])[0];
    const bn = /billion|bn|^b$/.test(unit) ? n : n / 1000;               // million -> billion
    return bn * CRORE_PER_BN[cur];
  }
  return null;
}

/* A company's revenue tier: the stored tier when the pipeline wrote one, otherwise read
   from the revenue figure on record (competitors.sales). No figure -> "unknown", which is
   offered as its own option so those companies stay findable. */
export function revenueTierOf(co) {
  if (co && co.revenue_filter) return co.revenue_filter;
  const rows = Array.isArray(co && co.sales) ? co.sales : (co && co.sales ? [co.sales] : []);
  for (const r of rows) {
    const cr = revenueCrore(r && (r.value || r.text));
    if (cr != null) return cr >= 5000 ? "high" : cr >= 1000 ? "mid" : "emerging";
  }
  return "unknown";
}

const ORDER = Object.keys(REVENUE_LABEL);

/* rows -> [{ v, n, l }] : every tier the rows carry, in house order, then by name. */
export function revenueOptions(rows) {
  return facetOptions(rows, (r) => (r && r.revenueTier) || null, ORDER)
    .map((o) => ({ ...o, l: REVENUE_LABEL[o.v] || o.v }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.v), ib = ORDER.indexOf(b.v);
      return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib) || a.v.localeCompare(b.v);
    });
}
