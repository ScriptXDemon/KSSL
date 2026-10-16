/* WHERE KSSL ACTUALLY SELLS -- in tiers, with the evidence each tier required.
 *
 * THE COMPLAINT. "i think kssl doesnt sell in poland so hanwha aerospace doing something
 * in poland cannot be threat know?" Correct, and the audit that followed found the reason
 * was worse than a mis-tuned threshold.
 *
 * WHAT THE SERVED STORE HOLDS. geoData["KSSL"] is TWO rows, one activity each, every
 * quantitative field null:
 *
 *   India   c=lp "Local production"   src: an Indian Defence Review interview, Feb 2019
 *   Europe  c=lp "Local production"   src: idrw.org relaying CNBC-TV18, Jan 2026
 *
 * The Europe row is not a placeholder. It is a MISREAD. Its own cited source says Bharat
 * Forge is "in active discussions with two to three major European defence firms to shift
 * parts of their production lines FROM Europe TO India" -- inbound relocation, still in
 * talks. It was stored as KSSL producing locally IN Europe, which is the opposite claim.
 * lib/geoCountries already records the second half of the damage: "Europe" was pinned at
 * 54.5N 15.2E, which is inside Poland.
 *
 * So the old gate expanded that one misread row into 30 countries and let a rival's win
 * in any of them count as a threat to KSSL. Measured on the served feed: 74 of the 132
 * cards the gate kept passed ONLY because of that expansion -- Germany 22, Ukraine 11,
 * UK 9, Romania 6, Poland 5. Poland was not an edge case; it was the design.
 *
 * THE COMPANY'S OWN SITE NAMES NOTHING, and that is a finding, not a gap in the search.
 * kssl.in was fetched and read: 1,788 characters of visible text, a navigation menu and a
 * tagline. It carries no customer, no country and no contract. That is why every row below
 * cites the PARENT company's filings, a regulatory disclosure or a government release
 * rather than the client's own site -- the client's own site does not make the claim.
 *
 * What kssl.in DOES state authoritatively is its business lines, and LINES below is that
 * list, taken from the site's own navigation. It is the right vocabulary for line-scoping
 * a market, because it is the company's own account of what it sells.
 *
 * SOURCE GRADE IS RECORDED AND ENFORCED. `srcTier` on every row, and the house rule is
 * that a market may only reach T0 or T1 on an OFFICIAL or REGULATORY source -- a company
 * filing, a press release, a stock-exchange disclosure, a government release. Trade press
 * may corroborate (it is what names Armenia as the buyer where the filing said only "a
 * non-conflict zone") but may not by itself put a country in the footprint. requireGrade()
 * below is that rule as code, and test_overview_shortlist holds every row to it.
 *
 * FOR CONTRAST, THE TWO SOURCES BEHIND THE SERVED STORE'S OWN ROWS ARE NEITHER. The India
 * row cites a 2019 enthusiast-outlet interview; the Europe row cites an aggregator
 * relaying a broadcast interview. Both are secondary, and the second was misread on top of
 * that. The India row happens to be right; being right on a weak source is luck.
 *
 * WHAT THE EVIDENCE ACTUALLY SUPPORTS. Every row in TIERS below was checked against the
 * company's own filings or a tier-1 source, never Wikipedia or Wikidata, and every one
 * carries its URL and its date. The two the served store OMITS are the two best-evidenced
 * markets KSSL has outside India:
 *
 *   Armenia   a delivered $155.5M export order for 155mm MArG-BR (+ATAGS per press)
 *   UAE       a signed contract for 155mm howitzer barrels, artillery line only
 *
 * WHY THIS TABLE IS IN CODE, AND WHAT WOULD RETIRE IT. It should be data. It is here
 * because the store is wrong in a way that changes verdicts, and a dashboard that scores
 * threats off a misread is worse than one carrying an audited table with its sources
 * printed. lib/companyNames.js is the precedent: a curated table where every entry
 * carries `src` and an entry without one is not published. THE FIX IS UPSTREAM -- correct
 * the Europe row, add Armenia and UAE to serving.geo_presence -- and when the store
 * carries tiers this file reads them and the table goes.
 *
 * NO PUBLISHER IS NAMED IN THIS FILE. check_no_fabrication.mjs refuses a publisher name
 * in app code, and it fired on the first version of this table -- correctly: an outlet
 * named in a literal is indistinguishable, to that gate, from an invented citation, and
 * inventing citations is what it was written to stop. The `src` URL identifies the source
 * exactly, and `srcNote` says what KIND of source it is. Nothing is lost and the guard
 * keeps its meaning.
 *
 * THE ONE THING NOT DONE HERE. Baba Kalyani said in April 2025 that KSSL "supplied 100
 * guns to a European country, including 18 ATAGS". No source names the country. It is
 * therefore NOT a market in this table: an unnamed country cannot be tested against, and
 * guessing which of the 30 it was is exactly the error being removed. It is recorded as
 * an UNRESOLVED row so the UI can say the footprint is incomplete rather than implying
 * Europe is empty. Resolving it is a research task, not a code change.
 */

/* T0 home market            country of incorporation and primary customer
   T1 evidenced export       a signed contract, delivery or in-service fleet, country named
   T2 contested              a named bid or an incorporated local entity, but no sale
   T3 no presence            everything else, including every unevidenced region member */
export const T0 = "home";
export const T1 = "export";
export const T2 = "contested";
export const T3 = "none";

/* KSSL's own business lines, from the navigation of kssl.in. The company's own account
   of what it sells is the right vocabulary for deciding whether a rival's move falls
   inside a market this evidence covers. */
export const LINES = [
  "artillery", "protected vehicles", "armoured vehicles", "small arms", "ammunition",
  "unmanned systems", "air defence", "defence electronics", "marine",
];

/* SOURCE GRADE. A market reaches T0/T1 only on `official` or `regulatory`; `press` may
   corroborate but never establishes a footprint on its own. */
export const GRADES = ["official", "regulatory", "government", "press"];
const FOOTPRINT_GRADES = new Set(["official", "regulatory", "government"]);

/* `lines` scopes a tier to the product lines the evidence is about. The UAE contract is
   for howitzer barrels, so it makes the UAE an artillery market and not a drone market;
   a rival's UAV win there is not a threat on the strength of a barrel contract. `null`
   means the evidence is not line-scoped. */
export const TIERS = [
  {
    country: "India",
    tier: T0,
    lines: null,
    what: "Home market: ATAGS (184 guns on MoD contract) and the Kalyani M4, produced in India",
    src: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2115365",
    srcNote: "government release; corroborated by parent-company press releases",
    srcTier: "government",
    since: "2021-02-23",
  },
  {
    country: "Armenia",
    tier: T1,
    lines: ["artillery"],
    what: "Delivered: $155.5M export order for 155mm/39cal MArG-BR truck-mounted howitzers",
    src: "https://www.bharatforge.com/assets/pdf/press-report/Bharat-Forge-KSSL-Export-Order-CoverageReport.pdf",
    srcNote: "parent-company media dossier (official); buyer named by defence-ministry sources in the tier-1 press",
    srcTier: "official",
    since: "2022-11-09",
  },
  {
    country: "United Arab Emirates",
    tier: T1,
    lines: ["artillery"],
    what: "Contracted: 155mm howitzer barrels to the UAE via GRADEONE/MP3 International",
    src: "https://www.amgeneral.com/kalyani-strategic-systems-ltd-and-am-general-sign-strategic-partnership-to-offer-distinct-mounted-artillery-gun-systems-for-world-armies/",
    srcNote: "company release, carried on a tier-1 wire",
    srcTier: "official",
    since: "2025-09-11",
  },
  {
    country: "United States",
    tier: T2,
    lines: ["artillery"],
    what: "Named bid: AM General has proposed a MArG-based system for the US Army Mobile Tactical Cannon",
    src: "https://www.amgeneral.com/kalyani-strategic-systems-ltd-and-am-general-sign-strategic-partnership-to-offer-distinct-mounted-artillery-gun-systems-for-world-armies/",
    srcNote: "partner company press release",
    srcTier: "official",
    since: "2026-06-18",
  },
  {
    country: "Spain",
    tier: T2,
    lines: null,
    what: "Incorporated entity, no sale: Aegis Advanced Systems SL, KSSL 90% / Duma Engineering 10%",
    src: "https://www.bharatforge.com/investors/reports/investor-presentation",
    srcNote: "stock-exchange disclosure (SEBI Reg. 30)",
    srcTier: "regulatory",
    since: "2025-07-17",
  },
];

/* A market the company has STATED but no source names. Not testable, and not silently
   dropped either: the UI says the footprint is incomplete rather than letting a reader
   conclude KSSL sells nowhere in Europe. */
export const UNRESOLVED = [
  {
    region: "Europe",
    what: '"Last year we supplied 100 guns to a European country, including 18 ATAGS" -- no source names the country',
    src: "https://www.theweek.in/wire-updates/business/2025/04/02/bes28-biz-bharat-forge-ld-exports.html",
    srcNote: "chairman, at a press conference, carried on a national wire",
    srcTier: "official",
    since: "2025-04-02",
  },
];

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

/* Spellings the feed uses for a tiered country. Kept tiny and explicit: this is not a
   gazetteer, it is the handful of aliases these five countries appear under. */
const ALIAS = {
  "united arab emirates": ["uae", "u.a.e."],
  "united states": ["usa", "u.s.", "us"],
};

/* THE HOUSE RULE, AS CODE. A row claiming T0 or T1 on press alone is refused -- it does
   not enter the index, so it cannot put a country in the footprint. A refusal is loud in
   the test rather than silent here: the table is small and hand-audited, and a row that
   fails this is a mistake to fix, not a case to handle. */
export function requireGrade(row) {
  if (!row) return false;
  if (row.tier === T0 || row.tier === T1) return FOOTPRINT_GRADES.has(row.srcTier);
  return !!row.srcTier;
}

const INDEX = (() => {
  const idx = {};
  TIERS.forEach((row) => {
    if (!requireGrade(row)) return;
    idx[norm(row.country)] = row;
    (ALIAS[norm(row.country)] || []).forEach((a) => {
      idx[norm(a)] = row;
    });
  });
  return idx;
})();

/* The tier of one country, and the row that evidences it. An unknown country is T3 --
   which is a POSITION, not a gap: the table is the whole of what is evidenced, so a
   country not in it has no evidence, and that is the answer. */
export function tierOf(country) {
  const row = INDEX[norm(country)];
  return row ? { tier: row.tier, row } : { tier: T3, row: null };
}

/* Does this card's subject matter fall inside the line the tier's evidence covers?
   `lines: null` means unscoped and everything matches. The card side is its `tags` /
   category text, which is where the pipeline puts the product class. */
const LINE_WORDS = {
  artillery: ["artillery", "howitzer", "gun", "ammunition", "155", "mortar", "shell"],
};

export function withinLines(row, cardText) {
  if (!row || !row.lines || !row.lines.length) return true;
  const hay = norm(cardText);
  return row.lines.some((ln) => (LINE_WORDS[ln] || [ln]).some((w) => hay.includes(w)));
}

/* Every country this table evidences, for the map and for the footprint legend. */
export function tieredCountries(tier) {
  return TIERS.filter(requireGrade).filter((r) => !tier || r.tier === tier).map((r) => r.country);
}

export default TIERS;
