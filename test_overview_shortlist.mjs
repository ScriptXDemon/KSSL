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
import { tierOf, TIERS, UNRESOLVED, requireGrade, LINES, GRADES, T0, T1, T2, T3 } from "./src/lib/footprint.js";

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

const ctx = shortlistContext(base);

/* ---- the footprint: a REGION ROW NO LONGER EXPANDS ----
   The store's only non-India row is "Europe", and it used to become 30 countries -- so a
   rival's win in Poland scored as a threat to a company with no evidence of selling
   there. 74 of the 132 cards the old gate kept passed only on that expansion. Worse, the
   row is a misread: its cited source says European firms are in talks to move production
   TO India (see lib/footprint). The market list is the audited tier table now. */
const foot = footprintCountries(base);
ck("the home market is in the footprint", foot.has("India"), Array.from(foot).sort());
ck("A REGION DOES NOT EXPAND: Poland is not a KSSL market",
   !foot.has("Poland"), Array.from(foot).sort());
ck("...nor is any other unevidenced member of it",
   !foot.has("Sweden") && !foot.has("Germany") && !foot.has("Ukraine"));
ck("the evidenced export markets ARE in it, though the served store omits both",
   foot.has("Armenia") && foot.has("United Arab Emirates"), Array.from(foot).sort());
ck("a country the store names is added even if the tier table has not heard of it",
   footprintCountries({ ...base, geoData: { KSSL: { Brazil: [{}] } } }).has("Brazil"));
ck("a REGION the store names is not", !footprintCountries({ ...base, geoData: { KSSL: { Africa: [{}] } } }).has("Africa"));

/* ---- the tiers ---- */
ck("India is the home market", tierOf("India").tier === T0);
ck("Armenia is an evidenced export market", tierOf("Armenia").tier === T1);
ck("the US is contested -- a named bid, not a sale", tierOf("United States").tier === T2);
ck("Spain is contested -- an incorporated JV, not a sale", tierOf("Spain").tier === T2);
ck("Poland is no presence", tierOf("Poland").tier === T3);
ck("an alias resolves to the same tier", tierOf("UAE").tier === T1 && tierOf("USA").tier === T2);
ck("every tiered country carries the source that put it there",
   TIERS.every((r) => /^https?:\/\//.test(r.src) && r.srcNote && r.what && r.since), TIERS.map((r) => r.country));
/* THE SOURCE STANDARD, ENFORCED RATHER THAN PROMISED. A market may reach T0/T1 only on an
   official, regulatory or government source. Trade press may corroborate -- it is what
   names Armenia where the filing said only "a non-conflict zone" -- but may not by itself
   put a country in the footprint. */
ck("every row records the GRADE of its source", TIERS.every((r) => GRADES.includes(r.srcTier)),
   TIERS.map((r) => `${r.country}:${r.srcTier}`));
ck("no market reaches T0/T1 on press alone", TIERS.every(requireGrade),
   TIERS.filter((r) => !requireGrade(r)).map((r) => r.country));
ck("...and a press-only row would be REFUSED, not quietly admitted",
   requireGrade({ tier: T1, srcTier: "press" }) === false && requireGrade({ tier: T2, srcTier: "press" }) === true);
ck("a row with no grade at all is refused", requireGrade({ tier: T0 }) === false);
ck("the line vocabulary is the company's OWN business lines",
   LINES.includes("artillery") && LINES.includes("ammunition") && LINES.includes("unmanned systems"), LINES);
ck("the unresolved European customer is recorded, not guessed at",
   UNRESOLVED.length === 1 && UNRESOLVED[0].region === "Europe" && /^https?:\/\//.test(UNRESOLVED[0].src));
ck("...and is NOT turned into a country", !foot.has("Europe"));

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
   qualifySignal(card({ impact: "adjacent" }), ctx).reason === "does not hit a Cummins Arabia line");
ck("a medium-severity signal from a FOREIGN rival is not critical",
   qualifySignal(card({ severity: "medium" }), ctx).reason === "not critical");
ck("an unrated signal is not critical either",
   qualifySignal(card({ severity: null }), ctx).reason === "not critical");
ck("THE OPERATOR'S OWN CASE: a rival's win in Poland is not a threat to KSSL",
   qualifySignal(card({ title: "Hanwha delivers K9PL howitzers to Poland" }), ctx).reason === "outside Cummins Arabia's markets");
ck("...nor is one in Germany, Sweden or Ukraine",
   ["Rheinmetall wins German Boxer order", "BAE delivers Archer to Swedish forces", "Rheinmetall supplies Ukraine"]
     .every((t) => qualifySignal(card({ title: t }), ctx).reason === "outside Cummins Arabia's markets"));
ck("a rival's move in the HOME market is a threat",
   qualifySignal(card({ title: "Kalashnikov promotes shotguns in India" }), ctx).tier === T0);
ck("a rival's move in an EVIDENCED EXPORT market is a threat",
   qualifySignal(card({ title: "Hanwha secures UAE as K9 howitzer production hub", tags: "Artillery" }), ctx).tier === T1);
ck("a rival's move in a CONTESTED market is kept, but marked as a bid not a sale",
   qualifySignal(card({ title: "Hanwha wins Spanish K9 contract" }), ctx).tier === T2);
ck("...and says so in its reason",
   /bidding in, not selling in/.test(qualifySignal(card({ title: "Hanwha wins Spanish K9 contract" }), ctx).reason));
ck("a card naming BOTH takes the STRONGER market",
   qualifySignal(card({ title: "Hanwha expands from India to Spain" }), ctx).tier === T0);
/* line scoping: the UAE is a KSSL market on a howitzer-BARREL contract */
ck("a rival's artillery move in a line-scoped market counts",
   qualifySignal(card({ title: "Hanwha builds howitzers in the UAE", tags: "Artillery" }), ctx).keep);
ck("a rival's DRONE move there does not -- one barrel contract is not a position in every line",
   qualifySignal(card({ title: "Anduril wins UAE drone contract", tags: "UAVs & Drones" }), ctx).reason === "outside Cummins Arabia's markets");
ck("A CARD NAMING NO COUNTRY IS KEPT -- silence is not evidence of foreign ground",
   qualifySignal(card({ title: "Rheinmetall wins a large recovery-vehicle order", company: "Rheinmetall" }), ctx).keep);
ck("...and is NOT credited with a market it never named",
   qualifySignal(card({ title: "Rheinmetall wins a large recovery-vehicle order", company: "Rheinmetall" }), ctx).tier === null);
/* "Bundeswehr" IS a country: the demonym table maps it to Germany, which is T3. A card
   that names its customer by service or ministry is not a card that named no country. */
ck("a service or ministry name counts as naming the country",
   qualifySignal(card({ title: "Rheinmetall wins a Bundeswehr order", company: "Rheinmetall" }), ctx).reason === "outside Cummins Arabia's markets");
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
