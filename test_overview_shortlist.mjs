/* An overview is a shortlist, and a shortlist must not lose anything.
 *
 * The competitive overview served all 1,077 signals. The operator asked for "a quick set
 * of signals which are critical", 20-30 of them, and for the rest to be reachable on the
 * news feed of the competitor they belong to.
 *
 * A filter that drops 97% of a feed is the most dangerous thing in this app, so most of
 * what is asserted here is about the ways it can be wrong rather than the way it is
 * right: that it demotes only on evidence, that an unscored lane is not silently emptied,
 * and that nothing is lost.
 */
import {
  qualifySignal, overviewShortlist, shortlistContext, foldDemotedIntoNews,
  footprintCountries, countriesNamed, countryVocabulary, indianRivalNames,
  SHORTLIST_MAX, MIN_QUALIFIED,
} from "./src/lib/shortlist.js";
import { setClient, clientShort } from "./src/lib/client.js";
import { readFileSync } from "node:fs";
import { tierOf, tieredCountries, T3 } from "./src/lib/footprint.js";

let fail = 0;
const ck = (name, ok, d) => {
  console.log(`  ${name.padEnd(66)} ${ok ? "PASS" : "FAIL"}${d !== undefined && !ok ? "  " + JSON.stringify(d) : ""}`);
  if (!ok) fail++;
};

const base = {
  client: { id: "KSSL", short: "KSSL" },
  geoData: { KSSL: { India: [{}], Europe: [{}] } },
  geoCountries: ["India", "Poland", "Spain", "United States", "Canada", "Malaysia"],
  competitors: {
    hanwha: { name: "Hanwha Aerospace" },
    knds: { name: "KNDS" },
    rheinmetall: { name: "Rheinmetall" },
  },
  competitorNews: { hanwha: [{ id: 1, title: "already held", url: "u-old", date: "2026-01-01" }] },
  details: {},
};
setClient(base.client);

const ctx = shortlistContext(base);

/* ---- the footprint: stored data only ----
   The audited tier table (five markets, source URLs, an unresolved European customer, the
   client's business lines) was hand-typed record data about the client. It is gone: the
   footprint is geoData for the client, and no tier is stored for any market. */
const foot = footprintCountries(base);
ck("the footprint is the countries the served store names", foot.has("India"), Array.from(foot).sort());
ck("nothing is added from a typed table: Armenia, UAE, Poland are not there",
   !foot.has("Armenia") && !foot.has("United Arab Emirates") && !foot.has("Poland"), Array.from(foot).sort());
ck("a country the store names is added",
   footprintCountries({ ...base, geoData: { KSSL: { Brazil: [{}] } } }).has("Brazil"));
ck("a REGION the store names is not", !footprintCountries({ ...base, geoData: { KSSL: { Africa: [{}] } } }).has("Africa"));
ck("no tier is stored, so no market has one", tierOf("India").tier === T3 && tierOf("India").row === null && tieredCountries().length === 0);
const footSrc = readFileSync(new URL("./src/lib/footprint.js", import.meta.url), "utf8");
ck("the footprint module holds no record: no URLs, no TIERS, no UNRESOLVED", !/https?:\/\/|export const (TIERS|UNRESOLVED|LINES|GRADES)|Armenia|Bharat/.test(footSrc));

/* ---- naming a country ---- */
const vocab = countryVocabulary(base);
ck("a country named outright is found", countriesNamed("wins Poland order", vocab).has("Poland"));
ck("a demonym is found", countriesNamed("Polish firms join", vocab).has("Poland"));
ck("a service name is found", countriesNamed("Anduril secures USAF contract", vocab).has("United States"));
ck('lowercase "us" is the pronoun, not the country',
   !countriesNamed("this gives us an edge", vocab).has("United States"), Array.from(countriesNamed("this gives us an edge", vocab)));
ck("no country named is an empty answer, not a guess", countriesNamed("a contract was signed", vocab).size === 0);

/* ---- the four tests ---- */
const card = (o) => ({ id: "c", dir: "threat", severity: "high", impact: "direct",
                       company: "Hanwha Aerospace", title: "wins order", severityRank: 3, ...o });

ck("a critical, on-line, in-market rival move is kept", qualifySignal(card({}), ctx).keep);
ck("a company that is not on the roster is not a competitive signal",
   qualifySignal(card({ company: "Leonardo" }), ctx).reason === "not a tracked rival");
ck("a signal that only touches a KSSL line is not a threat to one",
   qualifySignal(card({ impact: "adjacent" }), ctx).reason === `does not hit a ${clientShort()} line`);
ck("a medium-severity signal from a FOREIGN rival is not critical",
   qualifySignal(card({ severity: "medium" }), ctx).reason === "not critical");
ck("an unrated signal is not critical either",
   qualifySignal(card({ severity: null }), ctx).reason === "not critical");
ck("with no stored tier the market test cannot run: a card naming a country is kept, with no tier",
   qualifySignal(card({ title: "Hanwha delivers K9PL howitzers to Poland" }), ctx).keep
   && qualifySignal(card({ title: "Hanwha delivers K9PL howitzers to Poland" }), ctx).tier === null);
ck("A CARD NAMING NO COUNTRY IS KEPT -- silence is not evidence of foreign ground",
   qualifySignal(card({ title: "Rheinmetall wins a large recovery-vehicle order", company: "Rheinmetall" }), ctx).keep);
ck("...and is NOT credited with a market it never named",
   qualifySignal(card({ title: "Rheinmetall wins a large recovery-vehicle order", company: "Rheinmetall" }), ctx).tier === null);
ck("with an EMPTY footprint the market test cannot run, and does not demote",
   qualifySignal(card({ title: "wins US Army contract" }), { ...ctx, footprint: new Set() }).keep);
ck("the reason names the FIRST failing test, so the counts mean something",
   qualifySignal(card({ company: "Leonardo", impact: "adjacent", severity: "low" }), ctx).reason === "not a tracked rival");

/* ---- the list ---- */
const many = (n, o) => Array.from({ length: n }, (_, i) => card({ id: `c${i}`, ...o }));
const noise = many(200, { company: "Leonardo" });
const good = many(50, {});
const res = overviewShortlist(good.concat(noise), ctx, 30);
ck("the overview is capped", res.cards.length === 30, res.cards.length);
ck("the cap is 20-30 as asked", SHORTLIST_MAX >= 20 && SHORTLIST_MAX <= 30, SHORTLIST_MAX);
ck("it reports how many qualified, not just how many it shows", res.qualified === 50, res.qualified);
ck("and how many it considered", res.considered === 250, res.considered);
ck("NOTHING IS LOST: shown + demoted == considered",
   res.cards.length + res.demoted.length === 250, [res.cards.length, res.demoted.length]);
ck("the overflow is counted separately from the disqualified", res.capped === 20, res.capped);
ck("it says why it dropped what it dropped", res.reasons["not a tracked rival"] === 200, res.reasons);

const mixed = overviewShortlist(many(10, { dir: "watch", severityRank: 1 })
  .concat([card({ id: "top", dir: "threat", severityRank: 9 })]), ctx, 30);
ck("threats lead the shortlist", mixed.cards[0].id === "top", mixed.cards[0].id);

/* ---- the floor: an unscored lane is not an empty one ---- */
const thin = overviewShortlist(many(500, { severity: null }), ctx, 30);
ck("a lane the pipeline never scored comes back WHOLE", thin.cards.length === 500, thin.cards.length);
ck("and says it was never scored", thin.unscored === true);
ck("and sets nothing aside, so nothing is duplicated into news", thin.demoted.length === 0);
ck("the floor is a real threshold, not zero", MIN_QUALIFIED > 0);

ck("no cards, no crash", overviewShortlist(null, ctx).cards.length === 0);

/* ---- "move that signal into the news section of that competitor" ---- */
const demoted = [
  { id: "d1", url: "u-new", title: "A demoted Hanwha move", company: "Hanwha Aerospace", sowhat: "why", ago: "2026-05-01", tags: "Artillery", meta: "Artillery · Hanwha Aerospace · from example.test" },
  { id: "d2", url: "u-old", title: "Already in the news feed", company: "Hanwha Aerospace", ago: "2026-04-01" },
  { id: "d3", url: "u-x", title: "Not a rostered company", company: "Leonardo", ago: "2026-04-01" },
  { id: "d4", url: "", title: "No url to identify it by", company: "KNDS" },
  { id: "d5", url: "u-byname", title: "Resolved by the competitor NAME", competitor: "KNDS", ago: "2026-06-01" },
];
const folded = foldDemotedIntoNews(base, { competitive: demoted });
const hn = folded.competitorNews.hanwha;
ck("a demoted signal lands on its competitor's news feed", hn.some((r) => r.url === "u-new"), hn.map((r) => r.url));
ck("one already held is not added twice", hn.filter((r) => r.url === "u-old").length === 1, hn.map((r) => r.url));
ck("the news feed stays newest-first", hn[0].url === "u-new", hn.map((r) => r.date));
ck("`competitor` holds a NAME and still resolves -- the bug this fold shipped with",
   (folded.competitorNews.knds || []).some((r) => r.url === "u-byname"), folded.competitorNews.knds);
ck("a signal about a company not on the roster is not filed under one",
   !Object.values(folded.competitorNews).flat().some((r) => r.url === "u-x"));
ck("a signal with no url is not filed -- there is no identity to dedupe it on",
   !Object.values(folded.competitorNews).flat().some((r) => r.id === "d4"));
ck("the folded row carries the link out", hn.find((r) => r.url === "u-new").url === "u-new");
ck("nothing to fold means the dataset comes back untouched",
   foldDemotedIntoNews(base, { competitive: [] }) === base);
ck("no dataset, no crash", foldDemotedIntoNews(null, {}) === null);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
