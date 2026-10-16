/* ===== KSSL dataset wiring =====
   The embedded dataset carries the 35 globals. What follows is only the joins the
   stored dataset does not carry, plus two shape adapters. Nothing here is data — it
   is glue, and it is the same glue the standalone HTML runs on load.

   Pure: takes the fetched object, returns a new wired one. Nothing is written to
   `window`, so the app can re-fetch and re-wire without a reload. */
import { wireTendersWithRealDays } from "./tenderCalc.js";
import { titleCaseHeadline, tidySeparators } from "./profile.js";
import { formatDate } from "../utils/formatDate.js";
import { techKindOf, DIR_WORD } from "./overview.js";
import { sortCompaniesByName } from "./roster.js";
import { markOverlaps } from "./overlap.js";
import { registerGeoLocations } from "./geoCountries.js";
import { logger } from "../utils/logger.js";

/* THE PUBLISHER'S DATED PERMALINK IS AUTHORITATIVE FOR THE DAY.
   Most signal cards carry a month-only `ago` ("Sep 2026"); 740 of 765 URL-dated cards
   disagreed with their own URL, which encodes the exact day (c4isrnet's Sep-9 story
   read as "Sep 2026" -> "01 Sep 2026"). A "/YYYY/MM/DD/" segment in the article's own
   URL is the publisher's own date -- grounded, not derived -- so it upgrades the day
   where the card has none. Section-index URLs ("/industry/?contentFeatureId=...") carry
   no such segment and are left untouched. */
const URL_DATE = /\/(20\d{2})[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])(?:[/?#-]|$)/;
function urlDate(url) {
  const m = url && URL_DATE.exec(String(url));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
// True once the string already names a DAY: "09 Sep 2026" or an ISO "2026-09-09".
function hasDay(s) {
  return /^\d{1,2}\s+[A-Za-z]/.test(String(s || "")) || /^\d{4}-\d{2}-\d{2}/.test(String(s || ""));
}

/* THE PIPELINE ESCAPES, AND SO DOES THE RENDERER, SO EVERY AMPERSAND IS ESCAPED TWICE.

   extraction/signals/serving_fill.py stores `esc(card["title"])` and `esc(card["sowhat"])`
   -- html.escape at WRITE time, from a period when the UI injected raw strings. The
   React app escapes again at render (and the string builders call escAll), so the
   reader is shown the entity itself: "Protected &amp; Armoured Vehicles",
   "UAVs &amp; Drones", "Larsen &amp; Toubro".

   Measured on production: 132 of the 133 sowhat values containing an ampersand hold the
   five-character entity, and 11 of 12 titles. The `tags` column, written without esc(),
   holds a real "&" -- which is how it is known to be the writer and not the corpus (the
   corpus itself is clean: 0 of 5,000 document texts carry it).

   ONLY `&amp;` is decoded here, deliberately. A blanket unescape would be unsafe: chat.js
   interpolates tender and signal titles straight into markup without escaping, so
   turning a stored `&lt;` back into `<` would hand it an injection point. A bare `&`
   cannot open a tag, so this decode cannot make anything renderable that was not
   already. Fixing the writer is the real repair and is a separate change -- it moves a
   security boundary and needs chat.js hardened first.

   URLs benefit too: a query string carrying `&amp;` is a broken link, not a styling
   nit. */
function decodeAmp(v) {
  if (typeof v === "string") return v.indexOf("&amp;") < 0 ? v : v.split("&amp;").join("&");
  if (Array.isArray(v)) return v.map(decodeAmp);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = decodeAmp(v[k]);
    return out;
  }
  return v;
}

/* THE EM DASH IS OFF, AND THE "NOT MEASURED" MARK IS NOT.
 *
 * Requested as "remove M dashes from everywhere". They are not written here -- the
 * served store carries 13,937 strings containing one, all of them from the pipeline's
 * own prose (COMPSYN reads, signal summaries, gap notes, innovation bodies). Editing the
 * writers would fix new rows and leave every stored row as it is, so the rule is applied
 * on the way in, once, to whatever the backend sends.
 *
 * TWO THINGS THE DASH IS USED FOR, AND ONLY ONE OF THEM GOES.
 *
 *   punctuation  "...not just product — its Hazira record is the real threat". Becomes a
 *                spaced hyphen. The pause the sentence was built around is kept and the
 *                glyph is gone; deleting it outright would run two clauses together.
 *
 *   a value that does not exist  a bare "—" in a cell, which is this dashboard's mark
 *                for NOT MEASURED as opposed to zero. That mark stays. It is compared by
 *                string equality in four places (specs.has, gapAnalysis, matchupDossier,
 *                Positioning) to decide whether a field was published at all, so
 *                rewriting one side of that comparison and not the other would make
 *                unmeasured fields read as measured -- the exact failure this dashboard
 *                is held to. Measured on the live store: 0 served strings are a bare
 *                dash, so this branch protects a shape the data does not currently have,
 *                which is when it is cheapest to protect.
 *
 * The en dash goes the same way, except between digits (a range: "200–250 km"), where a
 * hyphen is what the range was always meant to be.
 */
export function plainDashes(v) {
  if (typeof v === "string") {
    if (v.indexOf("—") < 0 && v.indexOf("–") < 0) return v;
    if (v.trim() === "—" || v.trim() === "–") return v;
    return v
      .replace(/\s*—\s*/g, " - ")
      .replace(/(\d)\s*–\s*(\d)/g, "$1-$2")
      .replace(/\s*–\s*/g, " - ");
  }
  if (Array.isArray(v)) return v.map(plainDashes);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = plainDashes(v[k]);
    return out;
  }
  return v;
}

export function wireDataset(raw) {
  // shallow clone the containers we mutate; the leaf objects are ours after a fetch
  // decodeAmp first: every later rule (casing, promotion, grouping) should see the text
  // the reader will see, not a text with entities standing in for characters.
  /* One row per company is served (competitive_competitor); nothing is merged here.
     sortCompaniesByName puts every company list in alphabetical order. */
  const d = markOverlaps(sortCompaniesByName(plainDashes(decodeAmp({ ...raw }))));

  /* Market-lane headline casing (competitive and technology text is shown as stored). */
  try {
    // competitive and technology cards, details and news are shown as stored (no recasing)
    ["marketCards"].forEach((lane) => {
      d[lane] = (d[lane] || []).map((c) => {
        const out = { ...c, title: titleCaseHeadline(c.title) };
        // The per-pillar rewrite (gen_signal_text) is already a headline; title-case it
        // the same way so an enriched card and a not-yet-enriched one read alike.
        if (c.uiTitle) out.uiTitle = titleCaseHeadline(c.uiTitle);
        // THREAT ROUTING stays STRICT, by operator choice (quality over volume): a card is
        // a `threat` only when the write-time gain-gate proved a tracked rival's concrete
        // GAIN (a win/delivery) in a core KSSL line. A rival's mere ANNOUNCEMENT at
        // direct overlap + high severity is real but noisier, so it stays on `watch`
        // rather than crowd the threat board. (Earlier a direct+high elevation was tried
        // and removed at the operator's request -- keep the board small and high-signal.)
        // Recover the exact day from the article's own dated URL when the card's `ago`
        // carries only a month -- see urlDate above.
        const ud = urlDate(c.url);
        if (ud && !hasDay(out.ago)) {
          out.ago = formatDate(ud);
          if (!out.date) out.date = ud;
        }
        return out;
      });
    });
    const mapValues = (obj, fn) =>
      Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, fn(v)]));
    // `driver` arrives as "Elroy Air," on one row; the trailing comma is not a name
    d.innovations = mapValues(d.innovations, (rows) =>
      (rows || []).map((iv) => ({
        ...iv,
        t: titleCaseHeadline(iv.t),
        driver: typeof iv.driver === "string" ? tidySeparators(iv.driver) : iv.driver,
      })));
    // competitors is a MAP keyed by comp_id, not an array -- mapValues, not .map()
    d.competitors = mapValues(d.competitors, (c) => {
      if (!c || typeof c !== "object") return c;
      const out = { ...c };
      return out;
    });

  } catch (e) {
    logger.warn("wiring:headlineCase", e);
  }

  // overviewConfig: the feeds are the served rows as stored (no shortlist, no reclassification)
  try {
    const compCards = d.competitiveCards || [];
    /* Direction pills: one per stored direction code present in the cards -- known codes in
       the order threat, watch, fav, then any other code in order of appearance; the label is
       the code's word (DIR_WORD) or, for an unknown code, the stored classification. */
    const seenDirs = [];
    compCards.forEach((c) => {
      if (c.dir && !seenDirs.some((x) => x.f === c.dir)) seenDirs.push({ f: c.dir, l: DIR_WORD[c.dir] || c.classification });
    });
    const known = Object.keys(DIR_WORD);
    seenDirs.sort((a, b) => {
      const ia = known.indexOf(a.f), ib = known.indexOf(b.f);
      return (ia < 0 ? known.length : ia) - (ib < 0 ? known.length : ib);
    });
    d.techCards = (d.techCards || []).map((c) => {
      const kind = techKindOf(c.classification);
      return { ...c, kind, tags: [c.tags, kind].filter(Boolean).join(" ") };
    });
    d.overviewConfig = {
      ...d.overviewConfig,
      competitive: {
        ...d.overviewConfig.competitive,
        cards: compCards,
        cnt: "signals",
        dirWord: DIR_WORD,
        filters: compCards.length ? [{ f: "all", l: "All" }].concat(seenDirs) : [],
        metrics: [
          { l: "Competitive threats", act: "threat" },
          { l: "Watch signals", act: "watch" },
          { l: "Companies tracked", act: "all" },
        ],
      },
      market: { ...d.overviewConfig.market, title: "Top opportunity" },
      technology: {
        ...d.overviewConfig.technology,
        cards: d.techCards,
        title: "Technology Knowledge",
        cnt: "signals",
        dirWord: {},
        /* a stream's badge: only Adoptable is worded; a competitor advance carries none; a card
           with any other stored classification shows that classification (see Overview.labelFor) */
        tagWord: { rival: "", adopt: "Adoptable" },
        hideFilterButtons: true,
        filters: [],
        metrics: [
          { l: "Competitor advances", act: "rival" },
          { l: "Adoptable advances", act: "adopt" },
          { l: "Domains tracked", act: "all" },
        ],
      },
    };
  } catch (e) {
    logger.warn("wiring:overviewConfig", e);
  }

  /* matchups[].edge, .decision and every per-spec win / gap / state are STORED columns
     (competitive_matchup.edge_score, decision_level; competitive_matchup_specification
     .better_side, gap_value, comparability_state). They are served as they are and never
     recomputed here (see lib/edge.js). */

  /* RESOLVE THE CLIENT'S ID ONCE, FROM THE DATA.

     `client.short` is a display label ("KSSL"); the pipeline keys every row by a
     slug ("kssl-strategic-systems"). Joining on the label therefore matched
     nothing, and each consumer failed differently but silently: the geo overlap
     layer reported "no shared product category" for every rival in every country,
     the country header printed "KSSL absent" over KSSL's own sourced rows, and the
     Partnerships tab listed the client in its own competitor list and produced a
     shared-partner analysis of the client against itself. One lookup, done here,
     so no consumer has to know which id space it is in. */
  try {
    const fromComps = Object.keys(d.competitors || {}).find(
      (k) => (d.competitors[k] || {}).dir === "client",
    );
    const fromGeo = (d.geoComps || []).find((c) => c.isBf);
    const resolved = fromComps || (fromGeo && fromGeo.id);
    if (resolved) d.client = { ...(d.client || {}), id: resolved };
  } catch (e) {
    logger.warn("wiring:client.id", e);
  }

  // served coordinates for every location, read by the map and by the country helpers
  try {
    registerGeoLocations(d.geoLocations);
  } catch (e) {
    logger.warn("wiring:geoLocations", e);
  }

  /* Compute real remaining days for all tenders based on DB record and current system date */
  try {
    if (d.tenders) {
      d.tenders = wireTendersWithRealDays(d.tenders);
    }
    d.globalRequirements = Array.isArray(d.globalRequirements) ? d.globalRequirements : [];
  } catch (e) {
    logger.warn("wiring:tenders", e);
  }

  /* The chat knowledge base reads flattened geo rows and innovation items
     (d.geoRows / d.techItems) that the stored dataset does not carry. */
  try {
    const nameOf = {};
    (d.geoComps || []).forEach((c) => {
      nameOf[c.id] = c.name;
    });
    d.geoRows = [];
    Object.keys(d.geoData || {}).forEach((cid) =>
      Object.keys(d.geoData[cid]).forEach((ct) =>
        d.geoData[cid][ct].forEach((p) =>
          d.geoRows.push({ country: ct, company: nameOf[cid] || cid, name: p.name, c: p.c }),
        ),
      ),
    );
    d.techItems = [];
    Object.keys(d.innovations || {}).forEach((dom) =>
      (d.innovations[dom] || []).forEach((iv) => d.techItems.push({ ...iv, dom })),
    );
  } catch (e) {
    logger.warn("wiring:chatKb", e);
  }

  d.signalTheme = {};
  d.themeSignals = {};

  return d;
}
