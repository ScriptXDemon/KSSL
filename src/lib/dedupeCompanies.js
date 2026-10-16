/* ONE COMPANY, ONE ROW.
 *
 * The served roster carries 48 competitor rows for what the client's own master list
 * calls 44 companies. Four pairs are the same rival entered twice, and every one of
 * them was visible on the page: the competitor picker listed "Adani Defence" directly
 * above "Adani Defence", and "IDV — Iveco Defence Vehicles" directly above "Iveco".
 *
 * WHY THIS IS A MERGE AND NOT A DELETE. Both rows carry data, and neither is a superset
 * of the other. Dropping either one loses records the reader can see is missing:
 *
 *     adani          hq, sector, official site, 0 products
 *     adani-defence  3 products, 6 news articles, 0 hq
 *     iveco          5 products (Trakker, Guarani, LMV, SUPERAV, VIKING)
 *     idv            4 products (SUPERAV-based VBA, CL2X, MUV, Guaicurus), site, full hq
 *     raytheon       8 products (SM-6, ESSM, SPY-6, Tomahawk, Javelin, ...)
 *     rtx            5 products (Tomahawk, Patriot, LTAMDS, SM-6, Javelin), site, hq
 *     nexter         6 products (Caesar, KATANA, VBCI, Serval, Famas)
 *     knds           8 products (RCH 155, CAESAR, Boxer, DINGO, ...), site, hq
 *
 * So the surviving row takes the union: the field from whichever side has one, and the
 * two product lists concatenated with the duplicates dropped by name.
 *
 * WHAT MAKES A PAIR THE SAME COMPANY. Not my outside knowledge -- evidence carried in
 * the served record itself, one of:
 *
 *   1. THE SAME OFFICIAL DOMAIN. adani (adanidefence.com/) and adani-defence
 *      (adanidefence.com) publish from one site. A company is its own site; two rows
 *      that resolve there are one row. This test is unarguable, so it runs on the whole
 *      roster rather than from a list.
 *
 *   2. A SHARED DISTINCTIVE PRODUCT DESIGNATOR. iveco and idv both list SUPERAV and
 *      Guarani; raytheon and rtx both list SM-6, Tomahawk and Javelin; nexter and knds
 *      both list CAESAR. A model designator is not a category -- two rivals do not both
 *      sell "the CAESAR" -- so a shared one means one manufacturer entered twice.
 *
 * Rule 2 is the one that can be wrong: a genuine joint venture would show a shared
 * designator across two real companies. So it does NOT run automatically over the
 * roster. The three pairs are named in PAIRS below, each with the designator that
 * evidences it, and a fourth pair would have to be added deliberately -- with its
 * evidence -- rather than appearing because two rows happened to share a word.
 *
 * WHAT IS DELIBERATELY NOT MERGED. companyNames.js already records that "RTX" and
 * "KNDS" no longer expand, and that Kongsberg's group row must not be relabelled as its
 * defence division. That reasoning is about NAMES, not identity, and it does not
 * contradict this: rtx and raytheon are one manufacturer whichever name is printed, and
 * the surviving row keeps the name the roster shows today. Kongsberg has one row and is
 * untouched here.
 *
 * The merge runs before anything else reads the roster, so no consumer ever sees the
 * duplicate ids -- the picker, the feed, geo, patents and the news panels all count 44.
 */

/* canonical id -> [absorbed ids], with the evidence that ties them.
   The canonical side is the row carrying the official site, because that is the row a
   reader can check. */
export const PAIRS = [
  { keep: "idv", drop: ["iveco"], via: "shared designators: SUPERAV, Guarani" },
  { keep: "rtx", drop: ["raytheon"], via: "shared designators: SM-6, Tomahawk, Javelin" },
  { keep: "knds", drop: ["nexter"], via: "shared designator: CAESAR" },
  { keep: "huta-stalowa-wola", drop: ["hsw"], via: "HSW is the abbreviation of Huta Stalowa Wola; same HQ (Stalowa Wola, Poland)" },
];

const str = (v) => (v == null ? "" : String(v));

/* "https://www.adanidefence.com/" -> "adanidefence.com". Host only: the path, the
   scheme, a www. and a trailing slash are all ways the same site is written down. */
export function siteHost(v) {
  const s = str(v).trim();
  if (!s) return "";
  const m = s.match(/^[a-z]+:\/\/([^/?#]+)/i);
  const host = (m ? m[1] : s.split("/")[0]).toLowerCase();
  return host.replace(/^www\./, "");
}

const siteOf = (c) => siteHost((c && (c.site || c.website || c.url)) || "");

/* alias id -> canonical id, for the whole roster. Rule 1 is computed; rule 2 is read
   from PAIRS and only applied where BOTH ids exist. */
export function aliasMap(competitors) {
  const comps = competitors || {};
  const alias = {};

  // rule 1: same official domain
  const byHost = {};
  Object.keys(comps).forEach((cid) => {
    const h = siteOf(comps[cid]);
    if (!h) return;
    if (byHost[h] == null) byHost[h] = cid;
    else alias[cid] = byHost[h];
  });

  // rule 2: the named pairs
  PAIRS.forEach(({ keep, drop }) => {
    if (!comps[keep]) return;
    drop.forEach((cid) => {
      if (comps[cid] && cid !== keep) alias[cid] = keep;
    });
  });

  /* An alias must never point at another alias: if rule 1 folded X into Y and rule 2
     then folded Y into Z, X has to land on Z as well or its rows are attached to an id
     that no longer exists. Chains are short by construction; the guard is a bound, not
     an expectation. */
  Object.keys(alias).forEach((cid) => {
    let to = alias[cid];
    for (let i = 0; i < 8 && alias[to]; i += 1) to = alias[to];
    alias[cid] = to;
  });
  return alias;
}

const productKey = (p) =>
  str(typeof p === "string" ? p : (p && (p.name || p.n)) || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/* `keep` wins every scalar it actually has; `absorbed` fills the holes. Arrays are
   concatenated. This is why the order of the two arguments matters and why the row with
   the official site is the one kept. */
function mergeRecords(keep, absorbed) {
  const out = { ...absorbed, ...keep };
  Object.keys(absorbed || {}).forEach((k) => {
    const a = absorbed[k];
    const b = keep ? keep[k] : undefined;
    if (Array.isArray(a) || Array.isArray(b)) {
      const merged = [];
      const seen = new Set();
      [].concat(Array.isArray(b) ? b : [], Array.isArray(a) ? a : []).forEach((item) => {
        const k2 = productKey(item) || JSON.stringify(item);
        if (seen.has(k2)) return;
        seen.add(k2);
        merged.push(item);
      });
      out[k] = merged;
      return;
    }
    // a null/empty on the kept side is a hole, and the absorbed row may fill it
    if (b == null || b === "") out[k] = a;
  });
  return out;
}

/* Every store the roster ids reach. Mutates a shallow copy and returns it. */
export function dedupeCompanies(d) {
  const comps = (d && d.competitors) || null;
  if (!comps) return d;
  const alias = aliasMap(comps);
  if (!Object.keys(alias).length) return d;
  const to = (cid) => alias[cid] || cid;

  // 1. the roster itself
  const competitors = {};
  Object.keys(comps).forEach((cid) => {
    if (alias[cid]) return;
    competitors[cid] = comps[cid];
  });
  Object.keys(alias).forEach((cid) => {
    const canon = alias[cid];
    if (!competitors[canon]) return;
    competitors[canon] = mergeRecords(competitors[canon], comps[cid]);
  });

  // 2. the display order: rewrite, then drop the repeats, keeping first position
  const seenOrder = new Set();
  const compOrder = (d.compOrder || []).map(to).filter((cid) => {
    if (!competitors[cid] || seenOrder.has(cid)) return false;
    seenOrder.add(cid);
    return true;
  });

  // 3. the cid-keyed stores. Rows are concatenated, not replaced: an absorbed company's
  //    articles are that company's articles.
  const foldDict = (obj, concat) => {
    if (!obj) return obj;
    const out = {};
    Object.keys(obj).forEach((cid) => {
      const canon = to(cid);
      if (out[canon] === undefined) out[canon] = obj[cid];
      else if (concat && Array.isArray(out[canon]) && Array.isArray(obj[cid]))
        out[canon] = out[canon].concat(obj[cid]);
      else out[canon] = mergeRecords(out[canon], obj[cid]);
    });
    return out;
  };

  const competitorNews = foldDict(d.competitorNews, true);
  const geoData = foldDict(d.geoData, false);

  const seenGeo = new Set();
  const geoComps = (d.geoComps || [])
    .map((g) => (g && g.id ? { ...g, id: to(g.id) } : g))
    .filter((g) => {
      if (!g || !g.id) return true;
      if (seenGeo.has(g.id)) return false;
      seenGeo.add(g.id);
      return true;
    });

  return { ...d, competitors, compOrder, competitorNews, geoData, geoComps };
}

export default dedupeCompanies;
