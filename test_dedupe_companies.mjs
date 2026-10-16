/* One company must occupy one row -- and must not LOSE anything by being merged.
 *
 * The served roster carries 48 rows for the client's 44 companies: "Adani Defence"
 * appears twice, and so do Iveco/IDV, Raytheon/RTX and Nexter/KNDS. The picker listed
 * both halves of each pair one above the other.
 *
 * The risk in a merge is not that it fails to fire -- that is visible. It is that it
 * fires and quietly drops the half of the record that only the absorbed row carried:
 * `adani` holds the HQ and the sector, `adani-defence` holds the products and all six
 * news articles. So most of what is asserted here is about what SURVIVES.
 */
import { dedupeCompanies, aliasMap, siteHost, PAIRS } from "./src/lib/dedupeCompanies.js";

let fail = 0;
const ck = (name, ok, d) => {
  console.log(`  ${name.padEnd(62)} ${ok ? "PASS" : "FAIL"}${d !== undefined && !ok ? "  " + JSON.stringify(d) : ""}`);
  if (!ok) fail++;
};

/* ---- the host normaliser: the four ways one site gets written down ---- */
ck("scheme, www and trailing slash all reduce to the host",
   ["https://www.adanidefence.com/", "https://adanidefence.com", "http://ADANIDEFENCE.com/media", "adanidefence.com"]
     .every((u) => siteHost(u) === "adanidefence.com"));
ck("no site is not a match key", siteHost("") === "" && siteHost(null) === "");

/* ---- the roster as served, in miniature ---- */
const raw = () => ({
  competitors: {
    adani: { name: "Adani Defence", sector: "UAV/ISR", hq: "Ahmedabad, Gujarat, India", site: "https://www.adanidefence.com/", products: [] },
    "adani-defence": { name: "Adani Defence", sector: "defence and aerospace", site: "https://www.adanidefence.com", products: ["Drishti-10 drone", "Adani Jeet"] },
    iveco: { name: "Iveco", hq: "Bolzano, Italy", products: ["SUPERAV 8x8", "Trakker tactical military truck"] },
    idv: { name: "IDV", hq: "Via Alessandro Volta 6, 39100 Bolzano, Italy", site: "https://www.idvgroup.com", products: ["SUPERAV-based VBA", "CL2X unmanned vehicle"] },
    saab: { name: "Saab", site: "https://www.saab.com", products: ["Carl-Gustaf M4"] },
  },
  compOrder: ["adani-defence", "idv", "iveco", "saab", "adani"],
  competitorNews: {
    "adani-defence": [{ title: "a", url: "u1" }, { title: "b", url: "u2" }],
    adani: [{ title: "c", url: "u3" }],
    saab: [{ title: "d", url: "u4" }],
  },
  geoData: { adani: { countries: ["IN"] }, "adani-defence": { countries: [] }, saab: { countries: ["SE"] } },
  geoComps: [{ id: "adani-defence", name: "Adani Defence" }, { id: "adani", name: "Adani Defence" }, { id: "iveco" }, { id: "idv" }, { id: "saab" }],
});

const alias = aliasMap(raw().competitors);
ck("same official domain folds the pair", alias.adani === "adani-defence" || alias["adani-defence"] === "adani", alias);
ck("a named pair folds without needing a shared domain", alias.iveco === "idv", alias);
ck("an unrelated company is untouched", alias.saab === undefined);

const out = dedupeCompanies(raw());
const ids = Object.keys(out.competitors).sort();
ck("48-for-44 shrinks: 5 rows become 3", ids.length === 3, ids);
ck("saab survives whole", !!out.competitors.saab);

/* the point of the merge: the union, not the winner */
const adaniId = out.competitors["adani-defence"] ? "adani-defence" : "adani";
const merged = out.competitors[adaniId];
ck("the absorbed row's HQ is kept", merged.hq === "Ahmedabad, Gujarat, India", merged.hq);
ck("both product lists survive the merge",
   ["Drishti-10 drone", "Adani Jeet"].every((p) => merged.products.includes(p)), merged.products);
ck("the kept row's own products are not lost either", merged.products.length >= 2, merged.products);

const idv = out.competitors.idv;
ck("IDV keeps its own site", idv.site === "https://www.idvgroup.com");
ck("Iveco's products come across", idv.products.includes("SUPERAV 8x8") && idv.products.includes("Trakker tactical military truck"), idv.products);
ck("a product listed by BOTH halves appears once",
   idv.products.filter((p) => String(p).toLowerCase().replace(/[^a-z0-9]/g, "") === "superav8x8").length === 1, idv.products);

/* ---- the order, and every id-keyed store ---- */
ck("compOrder has no repeat", new Set(out.compOrder).size === out.compOrder.length, out.compOrder);
ck("compOrder names only surviving ids", out.compOrder.every((c) => out.competitors[c]), out.compOrder);
ck("compOrder keeps the first position of a folded pair", out.compOrder[0] === adaniId, out.compOrder);

const news = out.competitorNews[adaniId] || [];
ck("BOTH halves' articles reach the surviving company", news.length === 3, news.length);
ck("no article is dropped by the roster merge",
   ["u1", "u2", "u3"].every((u) => news.some((n) => n.url === u)), news);

ck("geoData folds onto the surviving id", !!out.geoData[adaniId] && out.geoData.adani === undefined || !out.geoData.iveco, Object.keys(out.geoData));
ck("geoData keeps the half that had countries",
   (out.geoData[adaniId].countries || []).includes("IN"), out.geoData[adaniId]);
ck("geoComps has one row per surviving company",
   out.geoComps.length === 3 && new Set(out.geoComps.map((g) => g.id)).size === 3, out.geoComps.map((g) => g.id));

/* ---- the guards ---- */
ck("a roster with no duplicates is returned unchanged",
   dedupeCompanies({ competitors: { saab: { name: "Saab", site: "https://saab.com" } }, compOrder: ["saab"] }).compOrder.length === 1);
ck("no dataset, no crash", dedupeCompanies(null) === null && dedupeCompanies({}) !== undefined);
ck("every named pair carries its evidence", PAIRS.every((p) => p.via && p.keep && p.drop.length), PAIRS);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
