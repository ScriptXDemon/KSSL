/* The competitive views show the static 45-rival roster, in roster order, and nothing a
 * served row carried is lost by the filter (it runs after the duplicate merge). */
import { applyRoster, ROSTER, sortCompaniesByName } from "./src/lib/roster.js";

let fail = 0;
const ck = (name, ok, d) => {
  console.log(`  ${name.padEnd(62)} ${ok ? "PASS" : "FAIL"}${d !== undefined && !ok ? "  " + JSON.stringify(d) : ""}`);
  if (!ok) fail++;
};

ck("the roster names 45 companies", ROSTER.length === 45, ROSTER.length);
ck("no id is listed under two companies", new Set(ROSTER.flat()).size === ROSTER.flat().length);

const d = applyRoster({
  competitors: {
    "mahindra-defence": { name: "Mahindra Defence" },
    rheinmetall: { name: "Rheinmetall", products: ["Skyranger 30"] },
    kalashnikov: { name: "Kalashnikov" },
    "elbit-systems": { name: "Elbit Systems" },
    kssl: { name: "KSSL", dir: "client" },
  },
  compOrder: ["kssl", "mahindra-defence", "rheinmetall", "elbit-systems", "kalashnikov"],
  geoComps: [{ id: "mahindra-defence" }, { id: "rheinmetall" }],
  competitorNews: { rheinmetall: [1] },
});
ck("a served row off the roster is not a competitor", !d.competitors["mahindra-defence"]);
ck("roster order, client first", JSON.stringify(d.compOrder) === JSON.stringify(["kssl", "kalashnikov", "rheinmetall", "elbit-systems"]), d.compOrder);
ck("an alias id is kept (elbit-systems when elbit is absent)", !!d.competitors["elbit-systems"]);
ck("a kept row is untouched", d.competitors.rheinmetall.products[0] === "Skyranger 30");
ck("geo picker follows the roster", d.geoComps.length === 1 && d.geoComps[0].id === "rheinmetall");
ck("other stores pass through", d.competitorNews.rheinmetall.length === 1);
ck("an unserved roster company gets no invented row", !d.competitors.leonardo);
ck("no competitors -> unchanged", applyRoster({ x: 1 }).x === 1);
const foreign = { competitors: { "acme-defence": { name: "Acme" } }, compOrder: ["acme-defence"] };
ck("a dataset with no roster company passes through", applyRoster(foreign) === foreign);

const s = sortCompaniesByName({
  competitors: {
    kssl: { name: "KSSL", dir: "client" },
    saab: { name: "Saab" }, "bae-systems": { name: "BAE Systems" }, anduril: { name: "anduril" },
  },
  compOrder: ["saab", "kssl", "bae-systems", "anduril"],
  geoComps: [{ id: "saab", name: "Saab" }, { id: "kssl", name: "KSSL", isBf: true }, { id: "anduril", name: "Anduril" }],
});
ck("alphabetical by name, client first", JSON.stringify(s.compOrder) === JSON.stringify(["kssl", "anduril", "bae-systems", "saab"]), s.compOrder);
ck("geo picker alphabetical, client first", s.geoComps.map((g) => g.id).join() === "kssl,anduril,saab", s.geoComps);
ck("sort: no competitors -> unchanged", sortCompaniesByName({ x: 1 }).x === 1);

console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
