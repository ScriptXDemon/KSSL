/* AN OVERVIEW IS A SHORTLIST, NOT AN ARCHIVE.
 *
 * The competitive overview served all 1,077 signals -- eleven pages of feed under a
 * heading that says "Overview". Reported as: an overview is "a quick set of signals which
 * are critical", and "out of 1000+ signals overview can carry only 20-30".
 *
 * Nothing is deleted. A signal that does not make the shortlist is still in the corpus,
 * still in the full feed behind the filters, and -- this is the part the operator asked
 * for specifically -- still in the news section of the competitor it belongs to. See
 * foldDemotedIntoNews below, which puts any demoted rival signal the news store does not
 * already hold into that rival's own feed. It is a change of prominence, never of record.
 *
 * FOUR TESTS, ALL OF THEM READ FROM THE SERVED RECORD. None of them is a new judgement
 * this file invents; each one is a field the pipeline already computed and the page was
 * already ignoring.
 *
 *   1. IS IT A TRACKED RIVAL?  `competitor` (the resolved roster id) or a `company` that
 *      matches a roster name. 573 of 1,077 competitive cards pass. Leonardo, Thales and
 *      Northrop Grumman are real defence news and are not on this client's roster of 44,
 *      so they are industry background rather than a competitive signal.
 *
 *   2. DOES IT HIT A KSSL LINE?  `impact === "direct"`, which serving_fill computes as
 *      "hits a KSSL line KSSL and this rival both sell" -- against `adjacent`, "touches a
 *      KSSL line". 267 pass. The distinction is the pipeline's, with its basis printed on
 *      the card (`impactBasis`), so this is not a re-derivation.
 *
 *   3. IS IT CRITICAL?  `severity === "high"`. 208 pass. Severity is derived on the
 *      backend response and is still served after the badge came off the card.
 *
 *   4. IS IT IN A MARKET KSSL IS IN?  This is the operator's own rule: "if a direct
 *      competitor is buying or selling something outside the KSSL geo presence it cannot
 *      be a threat or watch for KSSL". KSSL's footprint is read from the served geo store
 *      (India and Europe today), never hardcoded here. 141 pass; the 67 demoted are
 *      almost entirely US and Canadian awards -- American Rheinmetall's XM30 prototypes,
 *      Hanwha's US Army K9 contracts, KONGSBERG's JSM order from Canada.
 *
 * A CARD THAT NAMES NO COUNTRY IS KEPT. Test 4 can only demote on evidence; silence is
 * not evidence of foreign ground, and treating it as such would drop a Bundeswehr order
 * for not spelling out which country the Bundeswehr is in.
 *
 * THE FLOOR IS WHY THE MARKET PILLAR IS NOT EMPTIED. Market cards carry severity on 9 of
 * 548 rows and `impact: direct` on 4 -- that lane was never scored for relevance, so the
 * four tests would cut it to three cards and present the result as a considered
 * shortlist. When fewer than MIN_QUALIFIED survive, the lane is reported as UNSCORED and
 * the full feed is returned unchanged. An unmeasured lane must not look like a measured
 * one that came back nearly empty.
 */
import { geoCountryCoords, sameCountry } from "./geoCountries.js";
import { tierOf, T1, T3 } from "./footprint.js";

/* How many the overview carries once the tests have run. "20-30, etc" was the ask; the
   cap is the last step, so it slices a list that is already all-qualifying rather than
   standing in for the tests. */
export const SHORTLIST_MAX = 30;

/* Below this many qualifying cards, the lane is treated as never scored -- see above. */
export const MIN_QUALIFIED = 8;

/* A REGION ROW NEVER EXPANDS. This used to hold Europe -> 30 member countries, because
   the served store's only non-India row is the region "Europe" and without expansion the
   test would demote every European award.

   That was the wrong repair, twice over. A region is a claim about a SET; a threat test
   is a claim about a MEMBER, and the one does not license the other. And the row it was
   expanding is a misread: its own cited source says European firms are in talks to move
   production lines TO India, not that KSSL produces in Europe (see lib/footprint). So 74
   of the 132 cards the gate kept passed only because one mis-stored row was inflated into
   thirty countries -- Germany 22, Ukraine 11, UK 9, Romania 6, Poland 5.

   An unexpanded region is "footprint not established" for its members, which is exactly
   what the evidence supports. The market list now comes from lib/footprint, where every
   country carries the contract or filing that put it there. */

/* The adjective, service or ministry a headline uses instead of the country: "US Army",
   "Polish firms", "Spanish K9", "USAF", "Bundeswehr". Without these, test 4 keeps every
   card whose only geography is a demonym, which is most of them -- the first pass here
   left "Anduril Secures USAF CCA Production Contract" and "Malaysian Armed Forces Acquire
   18 CAESAR" on a shortlist scoped to India and Europe.

   Case-SENSITIVE on purpose: lowercase "us" is the pronoun and appears in prose
   constantly, and "MoD" is the British ministry while "mod" is a word.

   A missing entry fails SAFE: the card keeps its place on the overview instead of being
   demoted, so an incomplete list shows as a shortlist that is too generous, never as a
   signal quietly removed for a country nobody named. */
const DEMONYM = {
  American: "United States", "U.S.": "United States", "U.S": "United States",
  US: "United States", USA: "United States", USAF: "United States",
  USMC: "United States", USN: "United States", Pentagon: "United States",
  British: "United Kingdom", MoD: "United Kingdom",
  French: "France", German: "Germany", Bundeswehr: "Germany", Indian: "India",
  Korean: "South Korea", Japanese: "Japan", Australian: "Australia",
  Polish: "Poland", Spanish: "Spain", Swedish: "Sweden", Ukrainian: "Ukraine",
  Israeli: "Israel", Saudi: "Saudi Arabia", Egyptian: "Egypt", Turkish: "Turkey",
  Brazilian: "Brazil", Canadian: "Canada", Norwegian: "Norway", Finnish: "Finland",
  Danish: "Denmark", Dutch: "Netherlands", Italian: "Italy", Greek: "Greece",
  Czech: "Czechia", Romanian: "Romania", Pakistani: "Pakistan", Chinese: "China",
  Malaysian: "Malaysia", Singaporean: "Singapore", Indonesian: "Indonesia",
  Filipino: "Philippines", Thai: "Thailand", Vietnamese: "Vietnam",
  Taiwanese: "Taiwan", Emirati: "United Arab Emirates", Qatari: "Qatar",
  Kuwaiti: "Kuwait", Omani: "Oman", Bahraini: "Bahrain", Jordanian: "Jordan",
  /* THE SHORT FORM OF A TIERED COUNTRY. "UAE" is how every headline writes it, and
     without these the UAE -- a KSSL export market on a signed barrel contract -- was
     invisible to the country scan, so Hanwha setting up a K9 production hub there scored
     as "names no country" and slipped through untested. A market that is in the tier
     table has to be one the scanner can actually find. */
  UAE: "United Arab Emirates", "U.A.E.": "United Arab Emirates",
  "U.A.E": "United Arab Emirates",
  Swiss: "Switzerland", Austrian: "Austria", Belgian: "Belgium",
  Portuguese: "Portugal", Hungarian: "Hungary", Bulgarian: "Bulgaria",
  Croatian: "Croatia", Slovak: "Slovakia", Slovenian: "Slovenia",
  Estonian: "Estonia", Latvian: "Latvia", Lithuanian: "Lithuania",
  Irish: "Ireland", Serbian: "Serbia", Argentine: "Argentina",
  Chilean: "Chile", Colombian: "Colombia", Mexican: "Mexico",
  Nigerian: "Nigeria", Kenyan: "Kenya", Moroccan: "Morocco",
  Algerian: "Algeria", Ethiopian: "Ethiopia", Russian: "Russia",
  Armenian: "Armenia", Azerbaijani: "Azerbaijan", Bangladeshi: "Bangladesh",
};

const str = (v) => (v == null ? "" : String(v));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* KSSL's own markets: the audited tier table, plus any COUNTRY the served store names
   that the table does not (a new row upstream must not need a code change to count).
   A region row in the store is deliberately skipped -- see above.

   Returns a Set of country names. It is never empty in practice, because India is in the
   table; an empty one would mean the tier table had been emptied, and the gate below
   treats that as "cannot run" rather than "demote everything". */
export function footprintCountries(data) {
  const clientId = (data && data.client && data.client.id) || "KSSL";
  const rows = (data && data.geoData && data.geoData[clientId]) || null;
  const out = new Set();
  Object.keys(rows || {}).forEach((row) => {
    /* a country the coordinate table knows is a country; anything else is a region or a
       label, and a label is not a market */
    if (geoCountryCoords(row)) out.add(row);
  });
  return out;
}

/* Every country this text names, by the coordinate table's own vocabulary plus the
   demonyms above. The table is the vocabulary on purpose: a name it does not carry is
   one the map cannot plot either, so the two agree about what a country is. */
export function countriesNamed(text, vocabulary) {
  const t = str(text);
  const found = new Set();
  if (!t) return found;
  (vocabulary || []).forEach((c) => {
    if (new RegExp(`\\b${esc(c)}\\b`, "i").test(t)) found.add(c);
  });
  Object.keys(DEMONYM).forEach((dn) => {
    if (new RegExp(`\\b${esc(dn)}\\b`).test(t)) found.add(DEMONYM[dn]);
  });
  return found;
}

/* The vocabulary: every country the served geo store names, plus every footprint member,
   plus every demonym target -- so a card can be demoted for naming a country that
   happens not to be in this dataset's own geo rows. */
export function countryVocabulary(data) {
  const v = new Set();
  ((data && data.geoCountries) || []).forEach((c) => {
    if (c && geoCountryCoords(c)) v.add(c);
  });
  footprintCountries(data).forEach((c) => v.add(c));
  Object.values(DEMONYM).forEach((c) => v.add(c));
  return Array.from(v);
}

export function rosterNames(data) {
  const s = new Set();
  Object.values((data && data.competitors) || {}).forEach((c) => {
    const n = str(c && c.name).trim().toLowerCase();
    if (n) s.add(n);
  });
  return s;
}

/* Rivals headquartered in India, by the roster's own `hq` column -- never by a name that
   "looks Indian".

   THE hq COLUMN IS A FULL ADDRESS, NOT A COUNTRY. Measured on the served roster, 11 rows
   place a company in India and they are written at every granularity there is:

       "Ahmedabad, Gujarat, India"      country present
       "Mumbai, India"                  country present
       "Hyderabad, Telangana"           STATE only, no country
       "New Delhi" / "Pune" / "Bengaluru"   CITY only

   So a country test alone finds 6 of the 11 and silently drops Bharat Dynamics, BrahMos,
   Munitions India and SSS Defence -- four of the domestic rivals this rule exists for.
   The states and cities are matched too, from a short explicit list: this roster is 44
   companies, not a gazetteer, and a list a reviewer can read beats a geocoder they
   cannot check.

   A row whose location is empty is NOT counted. An unknown origin is not a domestic one,
   and a false positive here puts a foreign rival on the lower severity bar -- onto the
   overview on weaker evidence than the rule intends. */
const INDIA_PLACES = [
  "india",
  /* states and union territories that appear in this roster's hq column */
  "gujarat", "telangana", "maharashtra", "karnataka", "madhya pradesh", "tamil nadu",
  "uttar pradesh", "haryana", "punjab", "kerala", "odisha", "rajasthan", "west bengal",
  /* cities, for the rows that carry nothing else */
  "ahmedabad", "hyderabad", "new delhi", "delhi", "mumbai", "pune", "bengaluru",
  "bangalore", "chennai", "kolkata", "nagpur", "gwalior", "kanpur", "jabalpur",
  "coimbatore", "thiruvananthapuram", "visakhapatnam", "dehradun", "nashik",
];

export function indianRivalNames(data) {
  const out = new Set();
  Object.values((data && data.competitors) || {}).forEach((c) => {
    if (!c) return;
    const where = `${str(c.hq)} ${str(c.origin)} ${str(c.country)}`.toLowerCase();
    if (!where.trim()) return;
    if (!INDIA_PLACES.some((place) => where.includes(place))) return;
    const n = str(c.name).trim().toLowerCase();
    if (n) out.add(n);
  });
  return out;
}

/* Everything the tests need, built once per dataset rather than per card. */
export function shortlistContext(data) {
  return {
    roster: rosterNames(data),
    indianRivals: indianRivalNames(data),
    footprint: footprintCountries(data),
    vocabulary: countryVocabulary(data),
    details: (data && data.details) || {},
  };
}

/* Why this card is, or is not, on the overview. Returns `{ keep, reason }` -- the reason
   is the first failing test, so it can be counted and reported rather than guessed at. */
export function qualifySignal(card, ctx) {
  if (!card) return { keep: false, reason: "no card" };

  const isRival =
    !!card.competitor || ctx.roster.has(str(card.company).trim().toLowerCase());
  if (!isRival) return { keep: false, reason: "not a tracked rival" };

  if (card.impact !== "direct") return { keep: false, reason: "does not hit a KSSL line" };

  /* AN INDIAN RIVAL IS JUDGED ON A LOWER SEVERITY BAR, and the reason is measurable:
     of the 15 cards on this feed whose rival is an Indian company, ZERO are rated
     severity "high" -- 9 medium, 5 low, 1 unrated. A "high"-only bar therefore excluded
     every domestic rival from the overview of an Indian client, silently, as a property
     of how severity happens to be scored rather than as a judgement anyone made.

     They are the rivals that matter most: an Indian competitor bids the same MoD tender,
     under the same Buy-Indian category, for the same government-brokered export slots
     (the Armenia order was G2G). So `medium` clears the bar for them and `low` does not.
     A foreign rival still needs `high`. */
  const domesticRival = ctx.indianRivals.has(str(card.competitor || card.company).trim().toLowerCase());
  const bar = domesticRival ? new Set(["high", "medium"]) : new Set(["high"]);
  if (!bar.has(str(card.severity))) return { keep: false, reason: "not critical" };

  /* THE MARKET TEST, IN TIERS. Not "is this country on a list" -- what does the evidence
     for this country actually support? See lib/footprint for the table and its sources.

       T0 home / T1 evidenced export   a rival's move here is a threat
       T2 contested (a named bid, or an entity with no sale)   watch at most, never demoted
       T3 no presence                  demoted to the rival's own news feed

     The tier is LINE-SCOPED where its evidence is. The UAE is a KSSL market on the
     strength of a howitzer-barrel contract, so a rival's artillery move there counts and
     a rival's drone move there does not -- one barrel contract is not evidence of a
     position in every product class. */
  if (ctx.footprint.size) {
    const d = ctx.details[card.id] || {};
    const text = `${str(card.title)} ${str(card.sowhat)} ${str(d.what)}`;
    const named = countriesNamed(text, ctx.vocabulary);
    if (named.size) {
      let best = null;
      named.forEach((c) => {
        const t = tierOf(c, ctx.footprint);
        if (t.tier === T3) return;
        const rank = { [T1]: 1 };
        if (!best || rank[t.tier] > rank[best.tier]) best = t;
      });
      if (!best) return { keep: false, reason: "outside KSSL's markets" };
      return { keep: true, tier: best.tier, reason: "critical, on a served KSSL market" };
    }
    /* NAMES NO COUNTRY: KEPT. Test 4 can only demote on evidence, and silence is not
       evidence of foreign ground -- demoting on it would drop a Bundeswehr order for not
       spelling out which country the Bundeswehr is in. */
  }

  /* no country named, or no footprint to test against: kept, but NOT as a market hit --
     it earned its place on rival + line + severity alone, and the ordering below must not
     rank it above a card that named a market KSSL actually sells in. */
  return { keep: true, tier: null, reason: "critical, on a KSSL line, in a KSSL market" };
}

/* The overview's cards, and an account of what it left out.
 *
 * `cards` is what the feed shows. `demoted` is every card that did not make it, so the
 * caller can fold the rival ones into that rival's news. `unscored` says the lane was
 * never measured for relevance and the feed is unchanged -- which is a different state
 * from "measured, and almost nothing qualified", and is reported as one. */
export function overviewShortlist(cards, ctx, max = SHORTLIST_MAX) {
  const all = Array.isArray(cards) ? cards : [];
  const kept = [];
  const demoted = [];
  const reasons = {};
  /* the tier each kept card qualified under, so the sort below can read it without
     re-running the gate (and without the two disagreeing) */
  const tierByCard = new Map();
  all.forEach((c) => {
    const v = qualifySignal(c, ctx);
    if (v.keep) {
      kept.push(c);
      tierByCard.set(c, v.tier || null);
    } else {
      demoted.push(c);
      reasons[v.reason] = (reasons[v.reason] || 0) + 1;
    }
  });

  if (kept.length < MIN_QUALIFIED) {
    return {
      cards: all,
      demoted: [],
      qualified: kept.length,
      considered: all.length,
      capped: 0,
      unscored: true,
      reasons,
    };
  }

  /* THREATS FIRST, THEN NEWEST. Both keys are already on the card: severityRank is the
     backend's, and the feed's own priority order uses it. The cap slices AFTER the sort,
     so what falls off the end is the least urgent of the qualifying set, not an
     arbitrary tail. */
  /* THE MARKET DECIDES THE ORDER BEFORE THE BADGE DOES.
     Sorting on `dir` alone put "Hanwha wins Spanish K9 contract" at the top of the
     overview -- Spain is T2, an incorporated JV with no sale, and a rival's win in a
     country KSSL has not sold in is not the most urgent thing on the page whatever the
     served badge says. A rival's move in the home market or an evidenced export market
     outranks a threat-badged move in a market KSSL is only bidding in.

     T2 is what the audit called watch-level: kept, because a named bid is a real
     contest, but never above T0/T1. A card that named no country at all ranks below
     both -- it is on the list on rival, line and severity, and it has not shown a
     market. */
  const tierRank = { [T1]: 1 };
  const ranked = kept.slice().sort((a, b) => {
    const ta = tierRank[tierByCard.get(a)] || 0;
    const tb = tierRank[tierByCard.get(b)] || 0;
    if (ta !== tb) return tb - ta;
    const t = (b.dir === "threat" ? 1 : 0) - (a.dir === "threat" ? 1 : 0);
    if (t) return t;
    const r = (b.severityRank || 0) - (a.severityRank || 0);
    if (r) return r;
    return str(b.ago).localeCompare(str(a.ago));
  });

  const shown = ranked.slice(0, Math.max(1, max));
  const overflow = ranked.slice(Math.max(1, max));
  return {
    cards: shown,
    demoted: demoted.concat(overflow),
    qualified: kept.length,
    considered: all.length,
    capped: overflow.length,
    unscored: false,
    reasons,
  };
}

/* "ALSO MOVE THAT SIGNAL INTO THE NEWS SECTION OF THAT COMPETITOR."
 *
 * A demoted signal about a tracked rival belongs on that rival's page. 537 of the 573
 * rival cards are already in `competitorNews` -- the news store is filled from the same
 * feed -- so this is about the remaining 36, which would otherwise have been on the
 * overview and nowhere else.
 *
 * The url is the identity, the same key lib/news dedupes on, so a signal already held as
 * an article is not added a second time. Rows are appended in the served shape, not the
 * card shape, because that is what companyNews reads. */
export function foldDemotedIntoNews(d, demotedByLane) {
  if (!d || !d.competitorNews) return d;
  const byCid = {};
  Object.keys(d.competitors || {}).forEach((cid) => {
    const n = str(d.competitors[cid] && d.competitors[cid].name).trim().toLowerCase();
    if (n) byCid[n] = cid;
  });

  const news = { ...d.competitorNews };
  const seen = {};
  Object.keys(news).forEach((cid) => {
    seen[cid] = new Set((news[cid] || []).map((r) => str(r && r.url)).filter(Boolean));
  });

  let added = 0;
  Object.values(demotedByLane || {}).forEach((cards) => {
    (cards || []).forEach((c) => {
      const url = str(c && c.url);
      if (!url) return;
      /* `competitor` holds the rival's DISPLAY NAME, not its roster id: the served cards
         carry "Hanwha Aerospace", never "hanwha-aerospace". Using it directly as a key
         resolved nothing, and this whole fold was a silent no-op on its first run --
         competitorNews came back with exactly the row count it went in with. Both fields
         now go through the same name index. */
      const cid =
        byCid[str(c.competitor).trim().toLowerCase()] ||
        byCid[str(c.company).trim().toLowerCase()] ||
        (d.competitors[c.competitor] ? c.competitor : "");
      if (!cid || !d.competitors[cid]) return;
      if (!seen[cid]) seen[cid] = new Set();
      if (seen[cid].has(url)) return;
      seen[cid].add(url);
      news[cid] = (news[cid] || []).concat([{
        id: c.id,
        title: c.title,
        description: c.sowhat,
        url,
        image: c.image,
        date: c.ago || null,
        category: c.tags || "Update",
        source: str(c.meta).split("from ").pop() || undefined,
      }]);
      added += 1;
    });
  });
  if (!added) return d;

  /* newest first, the order every news panel assumes it is handed */
  Object.keys(news).forEach((cid) => {
    news[cid] = (news[cid] || []).slice().sort((a, b) => str(b && b.date).localeCompare(str(a && a.date)));
  });
  return { ...d, competitorNews: news };
}

export default overviewShortlist;
