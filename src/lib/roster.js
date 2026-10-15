/* Ordering helpers for competitor rows served by PostgreSQL.
 * Company membership is data owned by serving.competitive_competitor; this module
 * deliberately contains no built-in roster or fallback rows.
 */
const byName = (a, b) => String(a || "").localeCompare(String(b || ""), "en", { sensitivity: "base" });

export function sortCompaniesByName(d) {
  const comps = (d && d.competitors) || null;
  if (!comps) return d;
  const isClient = (cid) => (comps[cid] || {}).dir === "client";
  const nameOf = (cid) => (comps[cid] || {}).name || cid;
  const order = d.compOrder || [];
  const compOrder = order.filter(isClient)
    .concat(order.filter((cid) => !isClient(cid)).sort((a, b) => byName(nameOf(a), nameOf(b))));
  const geo = d.geoComps || [];
  const geoComps = geo.filter((g) => g && g.isBf)
    .concat(geo.filter((g) => !(g && g.isBf)).sort((a, b) => byName(a && a.name, b && b.name)));
  return { ...d, compOrder, geoComps };
}

export default sortCompaniesByName;
