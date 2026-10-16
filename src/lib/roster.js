/* THE STATIC COMPETITOR ROSTER (owner decision, 27 Sep 2026).
 *
 * The competitive views track a FIXED list of 45 rivals: the ones our own crawled corpus
 * holds the most raw pages for (parallax-poc data/competitors45.json), so the pipeline can
 * populate every profile from sourced data. A served row that is not on the list is not
 * shown as a competitor. A roster company the pipeline has not served yet (Leonardo, TKMS
 * and HII today) simply has no row until it is served -- no empty profile is invented.
 *
 * Runs AFTER dedupeCompanies: a merged pair (hsw -> huta-stalowa-wola, raytheon -> rtx,
 * nexter -> knds) has already been folded into its surviving id, so nothing an absorbed
 * row carried is lost here. Each entry lists the ids that company can be served under;
 * the first one present wins. The client's own row (dir "client") is always kept.
 */
export const ROSTER = [
  ["kalashnikov"], ["naval-group"], ["l3harris"], ["huta-stalowa-wola", "hsw"], ["norinco"],
  ["babcock"], ["anduril"], ["munitions-india"], ["paramount-group"], ["rheinmetall"],
  ["elbit", "elbit-systems"], ["knds", "nexter"], ["larsen-toubro"], ["aerovironment"],
  ["tata-advanced-systems"], ["supacat"], ["rtx", "raytheon"], ["oshkosh-defense", "oshkosh"],
  ["iwi"], ["rafael-advanced-defense-systems"], ["saab"], ["israel-aerospace-industries"],
  ["nammo"], ["lockheed-martin"], ["hanwha-aerospace"], ["bae-systems"], ["kongsberg"],
  ["sig-sauer"], ["roshel"], ["general-dynamics"], ["uvision-air"], ["poongsan"], ["aweil"],
  ["mbda"], ["bharat-dynamics"], ["patria"], ["brahmos-aerospace"], ["adani-defence", "adani"],
  ["sss-defence"], ["diehl-defence"], ["leonardo"], ["otokar"],
  ["thyssenkrupp-marine-systems", "tkms"], ["huntington-ingalls-industries", "hii"],
  ["premier-explosives"],
];

export function applyRoster(d) {
  const comps = (d && d.competitors) || null;
  if (!comps) return d;
  const keep = [];
  ROSTER.forEach((ids) => {
    const cid = ids.find((i) => comps[i]);
    if (cid) keep.push(cid);
  });
  // a dataset with none of the roster's companies (a test fixture, another client's data) is
  // not this roster's to filter
  if (!keep.length) return d;
  const clients = Object.keys(comps).filter((cid) => (comps[cid] || {}).dir === "client");
  const competitors = {};
  clients.concat(keep).forEach((cid) => { competitors[cid] = comps[cid]; });
  const compOrder = clients.filter((c) => (d.compOrder || []).includes(c)).concat(keep);
  const geoComps = (d.geoComps || []).filter((g) => !g || !g.id || competitors[g.id]);
  return { ...d, competitors, compOrder, geoComps };
}

/* ALPHABETICAL COMPANY ORDER (owner request, 28 Sep 2026).
 *
 * Every competitive view lists companies in compOrder (Competitor, Products, Partnerships,
 * Patents) or geoComps order (Geo Footprint), so sorting those two here orders every one
 * of them at once. The client row stays first in both; the rest sort by display name,
 * case- and accent-insensitive. Runs after applyRoster, which still decides WHO is shown.
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

export default applyRoster;
