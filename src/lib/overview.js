import { clientShort } from "./client.js";
import { globalRequirements } from "./globalRequirements.js";
/* Overview feed: the sequence logic, the group split, and the per-pillar metric
   strip. Pure — it returns data, and the React components render it. */
import { parseCr, CR_PER_MILLION } from "./gapModel.js";
import { isTender, isProject } from "./tenderIntel.js";

export const SEQ_LABEL = {
  recency: "Most Recent First",
  depth: "Richest Analysis First",
  category: "Grouped by Domain",
};
export const SEQ_SUB = {
  recency: "newest signals at top",
  depth: "most analytical lenses first",
  category: "ordered by category",
};

/* WHAT THE DROPDOWN OFFERS, not what the engine can do. `depth` and `category` are off
   the menu at the operator's request; their comparators below are untouched, and
   seqMode() still ACCEPTS both, so a saved URL or a restored session carrying
   ?seq=depth keeps working and simply has no menu entry to show for itself.
   Re-listing them here is the whole of putting them back. */
export const SEQ_OPTIONS = [
  ["priority", "Priority (threats first)"],
  ["recency", "Most recent"],
];

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* A sortable number for a displayed date; newer = higher.
   'DD Mon YYYY' -> 20260830, 'Mon YYYY' -> 20260900, 'Nd ago' -> most recent.

   Replaces a month-precision predecessor that returned year*12+month, under which
   '11 Aug 2026' and '30 Aug 2026' were the SAME number. Both date shapes are real:
   serving.signal_detail states the day ('30 Aug 2026') while signal_card.ago is often
   month-only ('Sep 2026'), so a comparator has to order across the two. A month-only
   value takes day 0, which puts it after every dated day of that month when sorting
   newest-first, and still ahead of the whole previous month. */
export function dateVal(s) {
  if (!s) return 0;
  const t = String(s).toLowerCase().trim();
  if (/ago\b/.test(t)) return 99999999; // '1d ago' is newer than any printed date
  let m = t.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m) {
    return parseInt(m[3], 10) * 10000 + (MONTHS[m[2]] || 0) * 100 + parseInt(m[1], 10);
  }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
  }
  m = t.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m) return parseInt(m[2], 10) * 10000 + (MONTHS[m[1]] || 0) * 100;
  m = t.match(/(\d{4})/);
  if (m) return parseInt(m[1], 10) * 10000;
  return 0;
}

/* Stamp `dirs` onto a pillar's priority groups so buildFeed cuts them by CONTENT.

   The first group claims the threat direction; the last takes everything else (the
   `last` rule inside buildFeed). Groups that already declare `dirs` -- market's, which
   names threat AND fav as "Live Opportunities" -- are left as declared. A config with
   one group has nothing to split and is passed through.

   Why: the served group defs carry only a heading and a size (competitive 6 + 99,
   technology 13 + 99), written against a demo dataset in which the first n cards
   happened to be the threats. On the live-shape dump every technology card is
   dir=watch, and the heading over all five of them read "Priority -- Capability Gaps
   -- rivals advancing in KSSL categories"; with 254 cards the other way round, 37
   threats sat under "Capability-Frontier Moves". `n` stays for any consumer still
   reading it, but it no longer decides who is in the group. */
/* A card carries a space-separated `tags` string. Both the feed grouping and the filter
   pills can select on a tag (technology's rival/adopt) as well as on `dir` (market's
   tenders/opportunities), so this one predicate is shared by both. */
export function cardHasTag(card, tag) {
  return String((card && card.tags) || "").split(/\s+/).includes(tag);
}

/* Does a card belong under a direction-filter pill? A pill may select by a single `dir`
   (the default, e.g. competitive threat/watch), an array of `dirs` (market "Latest
   Tenders" = fav+threat), or a `tag` (technology "Competitor Advancements" = rival). One
   resolver so Overview.jsx's feed, its filter counts and Layout.jsx's count line agree. */
export function filterMatch(card, filterKey, filters) {
  if (!filterKey || filterKey === "all") return true;
  const fo = (filters || []).find((x) => x.f === filterKey);
  if (fo && fo.tag) return cardHasTag(card, fo.tag);
  if (fo && Array.isArray(fo.dirs) && fo.dirs.length) return fo.dirs.indexOf(card.dir) >= 0;
  return card.dir === filterKey;
}

export function cutGroupsByDirection(groups, firstDirs = ["threat"]) {
  const list = Array.isArray(groups) ? groups : [];
  if (list.length < 2) return list.map((g) => ({ ...g }));
  if (list.some((g) => g && g.dirs && g.dirs.length)) return list.map((g) => ({ ...g }));
  return list.map((g, i) => (i === 0 ? { ...g, dirs: firstDirs.slice() } : { ...g }));
}

/* THE ONE COMPARATOR. Every surface that orders signal cards calls this.

   The operator asked for two things: "in threat only those news should come first which
   actually a direct competitor plus that news should create some kind impact", and
   "based on threat severity do sequencing of signal card everywhere where severity is
   high and recent show it first". The first is decided upstream, at write time --
   extraction/signals/threat_gate.py demotes a card whose company is not a served
   competitor, so `dir` here already means what it says. The second is this function.

   SEVERITY IS READ, NEVER DERIVED. `severityRank` is computed once, by the backend, from
   threat_gate.SEVERITY_RANK, and travels on the card. Deriving it here as well is the
   exact fault this repo has already paid for: one edge weight was computed on both sides
   and the frontend silently overwrote the served value, so a 1-0 winner was scored as
   behind. If the backend did not send a rank -- an older deploy, or a card the frontend
   itself synthesised from a tender -- the card is UNASSESSED, which is a real state and
   ranks last, not a zero and not a "low".

   A CARD WITH NO DATE SORTS LAST. dateVal("") is 0 and the date key is descending, so an
   undated card falls to the bottom of its severity band rather than sorting as though it
   were published today; SignalCard prints "date not known" on it rather than an empty
   corner. */
export const SEVERITY_UNASSESSED_RANK = 3;   // == threat_gate.SEVERITY_RANK[null]
export const DIR_RANK = { threat: 0, watch: 1, fav: 2 };
export const NO_DATE_LABEL = "date not known";
// The words for the absent state. "low" is a measurement; this is the lack of one.
export const SEVERITY_UNASSESSED_LABEL = "severity not assessed";

export function severityRankOf(card) {
  const r = card && card.severityRank;
  return typeof r === "number" && Number.isFinite(r) ? r : SEVERITY_UNASSESSED_RANK;
}

export function compareCards(data) {
  const when = (c) => dateVal(signalDate(c, data));
  // ungraded (severity not assessed) sinks to the bottom of its direction band, so a
  // brand-new card we could not grade never leads a graded one.
  const ungraded = (c) => (severityRankOf(c) === SEVERITY_UNASSESSED_RANK ? 1 : 0);
  return (a, b) =>
    (DIR_RANK[a.dir] === undefined ? 9 : DIR_RANK[a.dir]) -
      (DIR_RANK[b.dir] === undefined ? 9 : DIR_RANK[b.dir]) ||
    ungraded(a) - ungraded(b) ||
    // operator ("latest threat should be first"): date LEADS within the graded band;
    // severity only breaks a same-date tie -- and the SERVED rank decides that tie, never
    // a re-derivation from the display word.
    when(b) - when(a) ||
    severityRankOf(a) - severityRankOf(b) ||
    (b.sec ? b.sec.length : 0) - (a.sec ? a.sec.length : 0);
}

/* Ordered, re-ranked and split into the groups the feed renders.

   `data` is what the cards are DISPLAYED with: the date on a card comes from
   signalDate(card, data), which prefers the day-precision date in the detail panel over
   the card's own month-only `ago`. Sorting on `ago` while printing signalDate() is what
   produced a threat list reading Sep 2026, 11 Aug, 30 Aug, 11 Aug, 20 Aug, 4 Aug -- the
   order was real, it just belonged to a different set of values than the ones on screen.
   The comparator and the label have to read the same field. */
export function buildFeed(cfg, seqMode, data) {
  const cmp = compareCards(data);
  const when = (c) => dateVal(signalDate(c, data));
  const depth = (c) => (c.sec ? c.sec.length : 0);
  let cards = (cfg.cards || []).slice();
  /* EVERY MODE ENDS IN THE SAME COMPARATOR. A sequence option changes which key leads,
     never what "worse" means -- so "most recent" still puts a high-severity card above a
     low-severity one published the same day, and there is exactly one definition of the
     severity order in this file. */
  if (seqMode === "recency") {
    cards.sort((a, b) => when(b) - when(a) || cmp(a, b));
  } else if (seqMode === "depth") {
    cards.sort((a, b) => depth(b) - depth(a) || cmp(a, b));
  } else if (seqMode === "category") {
    cards.sort((a, b) => String(a.meta).localeCompare(String(b.meta)) || cmp(a, b));
  } else {
    cards.sort(cmp);
  }
  // re-rank display numbers after sort (a copy — the dataset card is not renumbered)
  cards = cards.map((c, n) => ({ ...c, rank: String(n + 1).padStart(2, "0") }));

  /* Only the "priority" branch needs group defs; without them, fall back to the single
     "All signals" bucket the other modes use, so buildFeed(cfg, "priority") on a cfg
     that carries no `groups` degrades to one flat group instead of throwing on the
     `groupDefs.some(...)` deref below. */
  const groupDefs =
    seqMode === "priority" && cfg.groups
      ? cfg.groups
      : [{ n: 99, h: SEQ_LABEL[seqMode] || "All signals", s: SEQ_SUB[seqMode] || "" }];

  const groups = [];
  let idx = 0;
  /* CONTENT, NOT POSITION. A group def carrying `dirs` claims the cards whose direction
     it names, wherever they sort. Without this the heading described a slice of the
     ranking -- "Live Opportunities" was simply the top three cards, whatever they were.
     Feeds whose defs carry no `dirs` keep the index behaviour below unchanged. */
  const byContent = groupDefs.some((g) => (g.dirs && g.dirs.length) || (g.tags && g.tags.length));
  if (byContent) {
    const claimed = new Set();
    const claims = (g, c) =>
      (g.dirs || []).indexOf(c.dir) >= 0 ||
      (g.tags || []).some((t) => cardHasTag(c, t));
    groupDefs.forEach((g, i) => {
      const last = i === groupDefs.length - 1;
      const slice = cards.filter(
        (c) => !claimed.has(c) && (last || claims(g, c)),
      );
      slice.forEach((c) => claimed.add(c));
      if (slice.length) groups.push({ h: g.h, s: g.s, cards: slice });
    });
    return { groups, total: (cfg.cards || []).length };
  }
  groupDefs.forEach((g, i) => {
    /* The LAST group takes everything still unassigned. The group defs carry fixed
       sizes (competitive is 6 + 99) that were written against a demo dataset of about
       forty cards; production serves 429, so a plain `slice(idx, idx + g.n)` dropped
       324 of them on the floor while the footer still counted all 429 -- the feed said
       "end of active signals, 429 total" under a list that stopped at 105. A group
       total is a layout hint for the first bucket, never a limit on the corpus. */
    const last = i === groupDefs.length - 1;
    const slice = last ? cards.slice(idx) : cards.slice(idx, idx + g.n);
    if (!slice.length) return;
    idx += slice.length;
    groups.push({ h: g.h, s: g.s, cards: slice });
  });
  return { groups, total: (cfg.cards || []).length };
}

/* The date a signal is shown with, in ONE format everywhere.

   The card aside printed the pipeline's `ago` ("Aug 2026") while the detail panel beside
   it printed the same event's day-precision date ("11 Aug 2026") -- 730 of 813 cards
   disagreed with their own panel, both on screen at once. That is what the report meant
   by dates being wrong and the format inconsistent: not that the day was incorrect, but
   that the same signal carried two different answers.

   The panel's value is the richer one and comes from the same pipeline field, so it wins
   when it exists; `ago` remains the fallback for the 83 rows that carry no day. Nothing
   is reformatted or re-derived here -- deriving a date a fourth way is how this started. */
export function signalDate(card, data) {
  const facts = ((data && data.details && data.details[card && card.id]) || {}).facts || [];
  let raw = "";
  for (const row of facts) {
    if (Array.isArray(row) && row[0] === "Date" && row[1]) { raw = String(row[1]); break; }
  }
  const ago = (card && card.ago) || "";
  if (!raw) raw = ago;
  /* THE VALUE WITH A DAY WINS. The facts "Date" is normally the richer field, but a
     few rows carry it month-only ("Sep 2026") while `ago` was upgraded to the exact day
     from the article's dated URL (see dataset.urlDate). A month-precision fact must not
     override a day-precision one, or a Sep-9 story reads "Sep 2026" beside its own URL. */
  const dayish = (s) => /^\d{1,2}\s+[A-Za-z]/.test(s);
  if (!dayish(raw) && dayish(ago)) raw = ago;
  /* Zero-pad a single-digit DAY so every card and panel reads "04 Aug 2026", not
     "4 Aug 2026" (the operator's one-width ask, mirrored in utils/formatDate). Only a
     "D Mon YYYY" value carries a day to pad: a month-only value ("Sep 2026") and a
     relative one ("1d ago") have none and pass through untouched. Kept inline --
     test_signal_date imports this function alone, so it can call no other module. */
  return raw.replace(/^(\d)(\s+[A-Za-z]{3}[A-Za-z]*\.?\s+\d{4})$/, "0$1$2");
}

/* How many signals one page of the feed shows. */
export const FEED_PAGE_SIZE = 50;

/* The page the reader was on, remembered per pillar for the session.

   `page` was React state and nothing else, so a reload, or a detour to Competitor and
   back (Layout remounts the feed per view), put the reader on page 1 again: the route
   remembered the pillar and the view but not the page. This keeps it in a Storage-shaped
   object (sessionStorage in the browser -- a tab's worth, not a stale page number from
   last week) under one key, as {pillar: {key, page}}.

   `key` names the FILTER the page was saved under (sequence, direction, tile, both
   search strings). A page is restored only for the same key: page 7 saved on "All" must
   not land on "Threat", which may be one page long. paginateFeed still clamps whatever
   comes back, so a corpus that shrank cannot produce a blank feed. Storage access is
   wrapped because a private window throws on it. */
export const FEED_PAGE_KEY = "kssl_feed_page";

function readFeedPages(store) {
  try {
    const raw = store && store.getItem(FEED_PAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function readFeedPage(store, pillar, key) {
  const saved = readFeedPages(store)[pillar];
  if (!saved || saved.key !== key) return 1;
  const n = parseInt(saved.page, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function writeFeedPage(store, pillar, key, page) {
  try {
    if (!store) return;
    const all = readFeedPages(store);
    all[pillar] = { key, page: Math.max(1, parseInt(page, 10) || 1) };
    store.setItem(FEED_PAGE_KEY, JSON.stringify(all));
  } catch (e) {
    /* storage refused (private mode, quota) -- the page simply is not remembered */
  }
}

/* ONE rule, two names. Two QA passes found this bug independently and each wrote its
   own helper: a search box that matched nothing said "no signals served yet" -- the
   message for an EMPTY CORPUS -- beneath a box holding the reader's own query.
   emptyFeedNote below is the one that survives; it says the same thing and quotes the
   query back. `emptyNote` is kept as an alias because a test names it, and because two
   functions computing one rule is how this codebase has produced disagreeing answers
   before. */
export const emptyNote = (args) => emptyFeedNote(args);

/* The sequence the reader chose, remembered per pillar for the session, beside the
   page. It was React state only, so a reload put the reader back on "Priority" --
   and since the remembered page is keyed by the sequence, the page that survived was
   page 1 of a sequence they had not chosen. Only a mode this build offers is
   restored; storage access is wrapped for the same reason as the page's. */
export const FEED_SEQ_KEY = "kssl_feed_seq";
const SEQ_MODES = new Set(SEQ_OPTIONS.map(([v]) => v));

export function readFeedSeq(store, pillar) {
  try {
    const raw = store && store.getItem(FEED_SEQ_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const v = parsed && typeof parsed === "object" ? parsed[pillar] : null;
    return SEQ_MODES.has(v) ? v : "priority";
  } catch (e) {
    return "priority";
  }
}

export function writeFeedSeq(store, pillar, mode) {
  try {
    if (!store) return;
    const raw = store.getItem(FEED_SEQ_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const all = parsed && typeof parsed === "object" ? parsed : {};
    all[pillar] = mode;
    store.setItem(FEED_SEQ_KEY, JSON.stringify(all));
  } catch (e) {
    /* storage refused -- the sequence simply is not remembered */
  }
}

/* Flatten the grouped feed to the cards a filter keeps, remembering which group each
   came from, then hand back one page of them re-grouped for render. Pure, so the page
   maths can be checked without a browser.

   `page` is 1-based and clamped: a filter that shrinks the list under the current page
   must not leave the reader staring at an empty feed. */
export function paginateFeed(groups, keep, page, size = FEED_PAGE_SIZE) {
  const flat = [];
  (groups || []).forEach((g) => {
    (g.cards || []).forEach((c) => {
      if (!keep || keep(c)) flat.push({ g, c });
    });
  });
  const pageCount = Math.max(1, Math.ceil(flat.length / size));
  const cur = Math.min(Math.max(1, page || 1), pageCount);
  const from = (cur - 1) * size;
  const slice = flat.slice(from, from + size);

  // re-group the slice: consecutive cards from the same group share one header
  const pageGroups = [];
  slice.forEach(({ g, c }) => {
    const tail = pageGroups[pageGroups.length - 1];
    if (tail && tail.h === g.h) tail.cards.push(c);
    else pageGroups.push({ h: g.h, s: g.s, cards: [c] });
  });

  return {
    groups: pageGroups,
    page: cur,
    pageCount,
    shown: flat.length,
    /* 1-based inclusive range, for "showing 101-150 of 429" */
    from: flat.length ? from + 1 : 0,
    to: from + slice.length,
    firstId: flat.length ? flat[0].c.id : null,
    /* which page a given card sits on -- the global search jumps straight to it */
    pageOf: (id) => {
      const at = flat.findIndex((x) => x.c.id === id);
      return at < 0 ? null : Math.floor(at / size) + 1;
    },
  };
}

/* The open / awarded / closed split, defined once so the nav badges, the tender
   tabs and the market metric tiles can never disagree on what "open" means. */
export function bucketTenders(tenders) {
  const list = tenders || [];
  const isAwarded = (t) => (t.status || "").toLowerCase() === "awarded" || t.urlKind === "award";
  const isClosed = (t) =>
    !isAwarded(t) && (t.isLive === false || t.dl <= 0 || (t.deadline || "").includes("Closed"));
  return {
    awarded: list.filter(isAwarded),
    closed: list.filter(isClosed),
    open: list.filter((t) => !isAwarded(t) && !isClosed(t)),
  };
}

/* The Market OVERVIEW "Latest Tenders" section is a shortlist, not the pipeline. The
   report and the Tender Pipeline list every tender; the overview lists the ATTENTION_HEAD
   that best fit KSSL right now, scored on the four things the brief names -- a strong KSSL
   fit, a market KSSL is present in, a sizeable published value, and recency (latest
   published / soonest closing). Everything else is one tab over.

   SCORED, THEN TOP-N. The count is deterministic -- min(head, open) -- and independent of
   the optional geo ctx, so marketSelfCheck (which recomputes this without a ctx) always
   agrees with the promoter (dataset.js) on HOW MANY tenders were shown, even if the geo
   boost reorders them. Pure: the promoter and the metric strip (metricsFor) both read
   this, so the visible list and the "Latest tenders" tile count can never drift. */
export const ATTENTION_DAYS = 14;
export const ATTENTION_HEAD = 20;
export function marketAttention(openTenders, ctx = {}) {
  const open = openTenders || [];
  const geo = ctx && ctx.geo instanceof Set ? ctx.geo : null;
  const rec = (t) => dateVal(t.posted || t.closingDate || t.ago);
  const score = (t) => {
    let s = 0;
    if (t.lean === "go") s += 100;            // strong KSSL fit
    else if (t.lean === "maybe") s += 40;     // worth qualifying
    if (geo && t.country && geo.has(t.country)) s += 25;   // geo presence
    const cr = parseCr(t.value);
    if (cr > 0) s += Math.min(30, cr / 200);  // high price/value (crore)
    if (t.dl >= 1 && t.dl <= ATTENTION_DAYS) s += 20;      // closing soon
    return s;
  };
  return open
    .map((t) => [t, score(t)])
    .sort((a, b) => b[1] - a[1] || rec(b[0]) - rec(a[0]) || (a[0].dl || 9999) - (b[0].dl || 9999))
    .slice(0, ATTENTION_HEAD)
    .map((x) => x[0]);
}

/* The Technology OVERVIEW is KNOWLEDGE, not a threat board. Competitive already owns the
   threat comparison -- anything that directly impacts KSSL is a competitive threat there --
   so this pillar drops the gap/watch framing entirely and reads as two knowledge streams:
   COMPETITOR ADVANCEMENTS (a tech move by a tracked competitor) and ADOPTABLE ADVANCES
   (defence-tech from anyone else that KSSL could learn from or adopt). The split is
   grounded: the pipeline sets `card.competitor` only when it resolved the actor to a
   tracked competitor, so that field's presence IS the classifier -- no name-matching.

   Every card is neutralised to dir='watch' (knowledge, so no red "gap" band) and tagged
   `rival` or `adopt`; the feed groups and the filter pills select on that tag. The two
   streams are each capped so both are represented on the shortlist. Pure -- the promoter
   (dataset.js) reads it for the feed, metricsFor counts the tags, navCounts counts the
   same cards. The full lane stays in d.techCards for global search; nothing is deleted. */
export const TECH_ATTENTION_HEAD = 30;
export function isRivalCard(c) {
  return !!(c && c.competitor && String(c.competitor).trim());
}
function withTag(card, tag) {
  const t = String((card && card.tags) || "").trim();
  return { ...card, dir: "watch", kind: tag, tags: t ? `${t} ${tag}` : tag };
}
export function technologyAttention(cards, isRival = isRivalCard, head = TECH_ATTENTION_HEAD) {
  const list = Array.isArray(cards) ? cards : [];
  const rivalFn = typeof isRival === "function" ? isRival : isRivalCard;
  const byRecent = (a, b) => dateVal(b && b.ago) - dateVal(a && a.ago);
  const rival = list.filter((c) => c && rivalFn(c)).sort(byRecent).map((c) => withTag(c, "rival"));
  const adopt = list.filter((c) => c && !rivalFn(c)).sort(byRecent).map((c) => withTag(c, "adopt"));
  // both streams represented: competitor advances lead a ~60% share, adoptable fills the rest
  const rHead = rival.slice(0, Math.ceil(head * 0.6));
  const aHead = adopt.slice(0, head - rHead.length);
  return rHead.concat(aHead);
}

/* Live counts from the served data, so the strip can never drift from the feed.
   Every pillar computes its tiles — the config carries labels and phrasing only;
   a number the service didn't back is never rendered. */
/* Tiles the strip reserves a slot for but prints nothing in. This is a DISPLAY decision
   and it is enforced in MetricsStrip, not here: metricsFor's contract is "what does this
   tile measure", and test_market_tiles.mjs holds it to that -- it asserts "All signals"
   reads the served card count, which is a measurement the report and the strip's own
   unbound-tile warning both still depend on. Blanking it here made that test fail, which
   is the test doing its job. Exported so the render has one list to read. */
export const BLANK_TILES = ["Analytical lenses", "All signals"];

export function metricsFor(cfg, pillar, d) {
  /* EVERY TILE STARTS AT "NOT MEASURED".

     The binding at the bottom of this function is by LABEL STRING, and a label no
     branch computes used to keep whatever `v` the config shipped -- the sample
     constants baked into overviewConfig ("13", "73,895", "6") -- which CountUp then
     animated up exactly like a measured figure. Two ways that happened with nothing
     on screen to show it: a served label renamed on the backend, and the catch below
     firing part-way through the block (that is how "Open opportunities 7" once sat
     over 89 open tenders). Blanking the values FIRST means both cases render "—",
     and the unbound branch at the end names the tile that missed, loudly. */
  const metrics = (cfg.metrics || []).map((m) => ({ ...m, v: "—" }));
  try {
    const cards = cfg.cards || [];
    /* A DIRECTION TILE COUNTS SOMETHING ITS FEED MAY NOT CARRY AT ALL.

       serving_fill.py assigns dir='threat' only where pillar=='competitive', so the
       technology feed's "Capability threats" counted a value that cannot exist and
       printed a measured-looking 0 under the served subtitle "rivals ahead /
       closing". A 0 there reads as "no rival is ahead" -- a finding nobody made.
       When NO card in the pillar carries the direction, the tile says so instead of
       counting to zero; when one does, it counts normally, so the day the backend
       starts assigning threats on technology this tile starts working by itself. */
    const dirCount = (dir) => {
      const n = cards.filter((c) => c.dir === dir).length;
      return n || "—";
    };
    const dirSub = (dir, word) =>
      cards.some((c) => c.dir === dir)
        ? null
        : `no served ${pillar} signal is assigned a ${word} direction - not assessed`;
    /* Two tiles showing one number is one tile. Every served technology card carries
       dir='watch', so "Watch signals" and "All signals" sit side by side reading the
       same count -- and a reader has no way to tell that from two measurements that
       happen to agree. The subtitle says which it is. */
    const dirIsAll = (dir) => {
      const n = cards.filter((c) => c.dir === dir).length;
      return n > 0 && n === cards.length
        ? `every one of the ${cards.length} served signals - no other direction is assigned`
        : null;
    };
    const lensSet = new Set();
    cards.forEach((c) => {
      if (c.lens) lensSet.add(c.lens);
      /* Tolerate a card whose `sec` is not an array: one malformed card must cost
         the lens count, never the whole strip. */
      (Array.isArray(c.sec) ? c.sec : []).forEach((s) => {
        if (s.lens) lensSet.add(s.lens);
      });
    });
    let byLabel = { "All signals": cards.length };
    const subByLabel = {};
    /* The sublines above that report a MISSING measurement rather than describing a
       present one. See the note where m.warn is set. */
    const WARN_SUBS = new Set();
    let actByLabel = {};
    if (pillar === "competitive") {
      byLabel = {
        ...byLabel,
        "Competitive threats": dirCount("threat"),
        "Watch signals": dirCount("watch"),
        "Companies tracked": new Set(cards.map((c) => c.company).filter(Boolean)).size,
        "Analytical lenses": lensSet.size,
      };
      const tSub = dirSub("threat", "threat");
      if (tSub) { subByLabel["Competitive threats"] = tSub; WARN_SUBS.add(tSub); }
      const wSub = dirSub("watch", "watch") || dirIsAll("watch");
      if (wSub) { subByLabel["Watch signals"] = wSub; WARN_SUBS.add(wSub); }
    } else if (pillar === "market") {
      const tenders = (d && d.tenders) || [];
      const { open } = bucketTenders(tenders);
      /* THE TILES DESCRIBE THE SHOWN SHORTLIST, so the visible list count and the tiles
         cannot disagree the way "958 rows above a tile reading 119 open" did. `shown` is
         exactly what dataset.js promotes into the feed (same function, same open set), so
         the "Live bids" tile equals the header count and the pager total. "Already
         concluded" and "Markets tracked" moved to the Market Report -- they are not
         actionable on an overview and were never in this feed. */
      const shown = marketAttention(open);
      const go = shown.filter((x) => x.lean === "go");
      // A tender whose source never published a value contributes nothing; if NO shown
      // tender carries one, the total is unknown, not zero -- "not measured" and "zero"
      // must not look the same.
      const priced = shown.filter((x) => parseCr(x.value) > 0);
      const liveCr = priced.reduce((t, x) => t + parseCr(x.value), 0);
      /* Stating a value and being SIZEABLE are two different things. TED publishes
         defence values in zloty, krone and koruna as well as euro, and parseCr
         converts only the currencies whose rate this build documents; those rows
         print their amount and stay out of the sum, so the subtitle names them
         rather than promising a total that quietly omits them. */
      const unconverted = shown.filter((x) => x.value && parseCr(x.value) <= 0).length;
      // Fit is a graded field the corpus may not carry at all. If NO open tender was
      // graded, "Strong fits" is not zero-fits -- it is not-assessed, and says so.
      const anyFit = open.some((x) => x.lean);
      // The Perceived Opportunities stream on the same feed: watch cards (geopolitical /
      // demand moves), which need no tender. Counted from the served set the feed shows.
      const opps = (cards || []).filter((c) => c.dir === "watch").length;
      byLabel = {
        ...byLabel,
        "Latest tenders": shown.length,
        "Strong fits": anyFit ? go.length : "—",
        "Tender value": priced.length ? Math.round(liveCr / CR_PER_MILLION["us$"]).toLocaleString("en-US") : "—",
        "Perceived opportunities": opps,
      };
      const goSub = anyFit ? null : "no fit assessment was served for these tenders";
      if (goSub) { subByLabel["Strong fits"] = goSub; WARN_SUBS.add(goSub); }
      const valSub = priced.length
        ? `${priced.length} of ${shown.length} publish a value` +
          (unconverted ? ` · ${unconverted} more in a currency not converted here` : "")
        : "no tender on this shortlist publishes a value";
      subByLabel["Tender value"] = valSub;
      if (!priced.length) WARN_SUBS.add(valSub);
      /* no line under this tile (owner request): the count alone, so it sits at the same
         height as its neighbours */
      /* The doors: each tile filters the feed to the rows it counts. "Latest tenders"
         opens the promoted open tenders (fav+threat); "Strong fits" and "Live bid value"
         narrow that by the tag/price the promoter stamps; "Perceived opportunities" opens
         the watch stream. tilePredicate reads those. */
      actByLabel = {
        "Latest tenders": "open",
        "Strong fits": "fit",
        "Tender value": "valued",
        "Perceived opportunities": "opps",
      };
    } else if (pillar === "technology") {
      const innovations = (d && d.innovations) || {};
      const domains = Object.keys(innovations).filter((k) => (innovations[k] || []).length);
      // Technology is knowledge, not a threat board: the two streams are competitor
      // advancements (a tracked rival's tech move) and adoptable advances (everyone
      // else's). Counted from the tags the promoter (technologyAttention) stamps.
      const tagCount = (t) => cards.filter((c) => cardHasTag(c, t)).length;
      byLabel = {
        ...byLabel,
        "Competitor advances": tagCount("rival"),
        "Adoptable advances": tagCount("adopt"),
        "Domains tracked": domains.length,
        "Analytical lenses": lensSet.size,
      };
      actByLabel = { "Competitor advances": "rival", "Adoptable advances": "adopt" };
      const rSub = tagCount("rival") ? null : "no competitor advancement is served";
      if (rSub) { subByLabel["Competitor advances"] = rSub; WARN_SUBS.add(rSub); }
      const aSub = tagCount("adopt") ? null : "no adoptable advance is served";
      if (aSub) { subByLabel["Adoptable advances"] = aSub; WARN_SUBS.add(aSub); }
      const nameOf = (id) => {
        const c = ((d && d.techCats) || []).find((x) => x.id === id);
        return c ? c.name : id;
      };
      subByLabel["Domains tracked"] = domains.length
        ? domains.map(nameOf).join("·")
        : "no domains served yet";
    }
    metrics.forEach((m) => {
      if (byLabel[m.l] == null) {
        /* LOUD, NOT SILENT. Nothing above computed a value for this label, so there
           is no measurement to show: the tile keeps its "—" and says why, and the
           served subtitle goes with it -- "rivals ahead / closing" over an unbound
           tile is a claim about a number that was never taken. */
        m.sub = `not wired - no measurement is computed for "${m.l}"`;
        m.warn = true;
        if (typeof console !== "undefined" && console.warn)
          console.warn(`metricsFor(${pillar}): no measurement bound to tile label "${m.l}"`);
        return;
      }
      m.v = String(byLabel[m.l]);
      if (subByLabel[m.l] != null) {
        m.sub = subByLabel[m.l];
        /* AN ABSENCE OF MEASUREMENT STILL HAS TO SPEAK. The tile sublines are hidden on
           screen now (MetricsStrip renders them only when `warn` is set) -- but the ones
           produced by dirSub()/dirIsAll() are not decoration, they are the sentence that
           stops a "—" or a coincidental count being read as a finding. Those keep
           showing; the descriptive ones do not. */
        if (WARN_SUBS.has(subByLabel[m.l])) m.warn = true;
      }
      if (actByLabel[m.l] != null) m.act = actByLabel[m.l];
    });
  } catch (e) {
    /* The strip is cosmetic; a missing field must never blank the feed. Values were
       blanked before the try, so what survives a throw is "—", never a served demo
       number wearing the authority of a measurement. */
  }
  return metrics;
}

/* metric tile -> which signals it opens. `tags` is a space-separated string on
   each card. */
export const TILE_LABELS = {
  atstake: "contested bids, by value",
  threat: "threats to active bids",
  fav: "openings to press",
  /* the Watch tile's `act` is "watch"; without this the count line ended in a bare
     " · " -- "13 of 26 signals ·" */
  watch: "watch signals",
  deadline: "by submission deadline",
  open: "latest tenders",
  fit: "strong fit",
  closing: "closing within 14 days",
  valued: "published a value",
  opps: "perceived opportunities",
  rival: "competitor advancements",
  // read at use, after the client is set
  get adopt() { return `advances ${clientShort()} can adopt`; },
  geo: "markets in play",
  positioning: "rating-matched rivals",
  gap: "capability gaps",
  patents: "patent activity",
  emission: "emission compliance",
  all: "sorted by relevance",
};

export function tilePredicate(act) {
  const has = (c, t) => String(c.tags || "").split(" ").includes(t);
  if (act === "all") return () => true;
  if (act === "atstake") return (c) => c.dir === "threat" || c.dir === "atstake" || has(c, "atstake");
  if (act === "threat") return (c) => c.dir === "threat" || has(c, "threat");
  if (act === "fav" || act === "watch") return (c) => c.dir === "fav" || c.dir === "watch" || has(c, "opening") || has(c, "fav") || has(c, "watch");
  /* The promoted open tenders: unpriced ones are `fav`, priced ones `threat`; the
     opportunity cards on the same feed are all `watch` and are not open tenders. */
  if (act === "open") return (c) => c.dir === "fav" || c.dir === "threat";
  /* Perceived opportunities: the demand/geopolitical watch stream, no tender required. */
  if (act === "opps") return (c) => c.dir === "watch";
  /* Technology streams, selected by the tag technologyAttention stamps. */
  if (act === "rival") return (c) => has(c, "rival");
  if (act === "adopt") return (c) => has(c, "adopt");
  /* Market shortlist tiles narrow the promoted set by the tag the promoter stamps
     (see dataset.js): a strong fit, a tender closing within 14 days, or a priced one. */
  if (act === "fit") return (c) => has(c, "fit");
  if (act === "closing") return (c) => has(c, "closing");
  if (act === "valued") return (c) => has(c, "valued");
  if (act === "deadline") return () => true;
  if (act === "gap") return (c) => c.dir === "threat" || has(c, "gap") || has(c, "tech");
  if (act === "patents") return () => true;
  return () => true;
}

/* ===== Dynamic nav counts (computed from live data, never hardcoded) ===== */
export function navCounts(d, gapModel) {
  const counts = {};
  try {
    // Positioning: distinct competitor companies across matchups
    const posCompanies = new Set();
    Object.values(d.matchups).forEach((m) => {
      const co = (m.comp || "").split("·")[0].trim();
      if (co) posCompanies.add(co);
    });
    counts.positioning = posCompanies.size;
    // Partnerships: competitor profiles (exclude the client's own reference network)
    counts.partnerships = Object.keys(d.competitors).filter((k) => k !== ((d.client && d.client.id))).length;
    // Geo: distinct countries across all companies' footprints
    const geoCountries = new Set();
    Object.values(d.geoData).forEach((byCountry) =>
      Object.keys(byCountry || {}).forEach((c) => geoCountries.add(c)),
    );
    counts.geo = geoCountries.size;
    /* WHAT THE OVERVIEW SHOWS, NOT WHAT THE LANE HOLDS.
       This read d.competitiveCards.length, so the rail badge said 1,212 beside a feed
       carrying 30 -- the reader's obvious conclusion being that 1,182 cards had gone
       missing. The overview is a shortlist now (lib/shortlist), so the badge counts the
       shortlist. A lane reported UNSCORED is returned whole, and there the badge counts
       the whole lane again, which is still "what the overview shows". */
    const ovCfg = (d.overviewConfig && d.overviewConfig.competitive) || null;
    counts.overview = ovCfg && Array.isArray(ovCfg.cards)
      ? ovCfg.cards.length
      : d.competitiveCards.length;
    /* Profile lists the rivals — the client's own row is not a competitor profile.
       `d.client.id` is the slug by the time this runs; wireDataset resolves it from
       the row whose dir is "client", precisely so this join is not on a display label. */
    counts.profile = Object.keys(d.competitors).filter(
      (k) => k !== ((d.client && d.client.id)),
    ).length;
    counts["threat-analysis"] = Object.entries(d.competitorNews || {}).filter(([k]) => k !== ((d.client && d.client.id))).reduce((n, [, v]) => n + (v ? v.length : 0), 0);  // competitor moves on record (competitorNews)
    counts.projects = (d.projects || []).length;
    counts.finances = 0;

    /* Products explorer lists COMPETITOR products (Products.jsx builds them from the
       comp side of matchups + each competitor's own products), so the badge counts
       those — not KSSL's own SKUs, which is what it used to show (a "1" over a catalog
       of dozens). Same two sources the page reads, deduped by name. */
    const clientId = (d.client && d.client.id);
    const compProds = new Set();
    Object.values(d.matchups || {}).forEach((m) => {
      const nm = (m.comp || "").replace(/.*·\s*/, "").trim();
      if (nm) compProds.add(nm.toLowerCase());
    });
    Object.entries(d.competitors || {}).forEach(([cid, co]) => {
      if (cid === clientId) return;
      (co.products || []).forEach((p) => {
        const nm = typeof p === "string" ? p : (p.name || p.n || "");
        if (nm) compProds.add(nm.toLowerCase());
      });
    });
    counts.products = compProds.size;

    const { open, awarded, closed } = bucketTenders(d.tenders);
    /* The Market overview badge counts the TENDERS it opens — all of them, since the
       page carries open, awarded, closed and the portals as tabs. It used to count
       `marketCards` — three signal cards — and sat as a "3" above a page listing
       eighty-nine tenders. Tender Pipeline below it is the open subset, so the two
       rows now say different things. */
    /* The overview badge counts the CARDS the feed actually opens. That is the curated
       tender shortlist served on overviewConfig.market.cards -- NOT d.marketCards, which
       still carries the demand-news lane for search and the top bar. Counting the raw
       lane here put a 141 on a feed that shows the shortlist. */
    /* The Market overview is the tender tables now (Top tenders, Projects): its badge counts their rows. The signal
       cards moved to Global Requirements, whose badge counts them. */
    const ranked = (d.tenders || []).filter((t) => t.rank && t.clientFit !== "weak");
    counts["m-overview"] =
      Math.min(10, ranked.filter((t) => isTender(t)).length) + Math.min(8, ranked.filter((t) => isProject(t)).length);
    counts["global-requirement"] = globalRequirements(d).length;   // the rows the page lists
    counts["m-report"] = (d.tenders || []).length;
    counts.tender = open.length;
    counts["awarded-tenders"] = awarded.length;
    counts["closed-tenders"] = closed.length;

    // patents badge: indexed filings, not a hardcoded 1
    counts["patents-comp"] = (d.PATENTS && d.PATENTS._meta && d.PATENTS._meta.total) || 0;
    const innovTotal = Object.keys(d.innovations).reduce(
      (n, k) => n + (d.innovations[k] || []).length,
      0,
    );
    // the Overview badge counts the FEED it opens (tech signal cards); the Innovation
    // badge counts innovations. Labelling one with the other's number was a mismatch
    // visible on screen: badge 29 above a feed of 11.
    /* And it counts the CURATED overview cards, not the whole tech lane -- the same rule
       as m-overview above. The overview is a shortlist (technologyAttention, applied in
       dataset.js), so counting d.techCards here put the whole-lane number (e.g. 904) on a
       feed showing 30. d.techCards stays the source for global search. */
    counts["t-overview"] =
      ((d.overviewConfig && d.overviewConfig.technology && d.overviewConfig.technology.cards) ||
        d.techCards || []).length;
    counts.innovation = innovTotal;
    // gap badge: how many 'behind' gaps this pillar carries
    counts["gap-competitive"] = (gapModel || []).filter(
      (g) => g.direction === "behind" && g.pillar === "competitive",
    ).length;
  } catch (e) {
    /* counts are cosmetic; never break the app over one */
  }
  return counts;
}

/* Header strings, computed rather than hardcoded. */
export function viewMetaFor(d) {
  /* Degrade, do not throw. The try/catch below only wrapped the two loops, but the
     count lines under it dereferenced d.competitors/d.geoData/d.competitiveCards
     unguarded -- so viewMetaFor(null) / viewMetaFor({}) threw straight past the
     "static copy" the catch promises. Default d and each field so a missing dataset
     reaches the static copy with zero counts. */
  d = d || {};
  const competitors = d.competitors || {};
  const geoData = d.geoData || {};
  let allianceCount = 0;
  let geoCountries = new Set();
  try {
    Object.entries(competitors).forEach(([k, c]) => {
      if (k !== ((d.client && d.client.id)) && c.partners) allianceCount += c.partners.length;
    });
    Object.values(geoData).forEach((byCountry) =>
      Object.keys(byCountry || {}).forEach((c) => geoCountries.add(c)),
    );
  } catch (e) {
    /* fall through to the static copy below */
  }
  const partnerCount = Object.keys(competitors).filter((k) => k !== ((d.client && d.client.id))).length;
  const geoCompCount = Object.keys(geoData).filter((k) => k !== ((d.client && d.client.short))).length;
  const alertCount = (d.competitiveCards || []).length;
  const momentCount = Object.entries(d.competitorNews || {})
    .filter(([k]) => k !== ((d.client && d.client.id)))
    .reduce((n, [, v]) => n + (v ? v.length : 0), 0);
  return {
    overview: {
      title: "Competitive Intelligence",
      cnt: `${alertCount} active signals · sorted by relevance`,
      filters: true,
    },
    profile: {
      title: "Competitor Profile",
      cnt: `${partnerCount} companies tracked · everything we track on one rival`,
      filters: false,
    },
    "threat-analysis": {
      title: "Competitor Moment",
      cnt: `${momentCount} competitor moves on record · newest first`,
      filters: false,
    },
    products: {
      title: "Products",
      /* British spelling and singular "catalogue", as every other heading (FE 18) */
      cnt: "Competitor & client product catalogue across tracked defence categories",
      filters: false,
    },
    positioning: {
      title: "Product Evaluation",
      cnt: `${clientShort()} products mapped to rival products by spec category`,
      filters: true,
    },
    partnerships: {
      title: "Partnership",
      cnt: `${partnerCount} competitors · ${allianceCount} alliances mapped`,
      filters: false,
    },
    projects: {
      title: "Projects",
      cnt: `${(d.projects || []).length} competitor projects on record`,
      filters: false,
    },
    finances: {
      title: "Finances",
      cnt: "0 financial records on record",
      filters: false,
    },
    geo: {
      title: "Geo Footprint",
      cnt: `${geoCompCount} competitors · ${geoCountries.size} markets · competitor activity by country`,
      filters: false,
    },
    /* m-report was the only view with no entry here, which is why Layout carried a
       hardcoded "Market Report" -- and that literal was gated on a flag covering all
       four tender views, so the page labelled "Tender Pipeline" on the rail rendered
       under the heading "Market Report". */
    "m-report": {
      title: "Market Intelligence",
      cnt: "Demand shape, spec and requirement",
      filters: false,
    },
    tender: {
      title: "Tenders",
      cnt: "Live opportunities matched to product portfolio",
      filters: false,
    },
    "global-requirement": {
      title: "Global Requirements",
      cnt: "Worldwide defence procurement requirements and capability demand",
      filters: false,
    },
    "awarded-tenders": {
      title: "Awarded Tenders",
      cnt: "Contracts awarded or settled",
      filters: false,
    },
    "closed-tenders": {
      title: "Closed Tenders",
      cnt: "Opportunities closed or expired",
      filters: false,
    },
    innovation: {
      title: "Innovation Pipeline",
      cnt: `Technology developments tracked across ${clientShort()} product domains`,
      filters: false,
    },
    "patents-comp": {
      title: "Patent",
      cnt: "Filings by rival and by technology field · sourced from patent records",
      filters: false,
    },
    "gap-competitive": {
      title: "Gap Analysis",
      cnt: `Where ${clientShort()} trails rivals, from the Positioning spec comparisons`,
      filters: false,
    },
  };
}

/* What an empty feed says. It named only the tile and the direction pill, so a
   query that matched nothing -- in the feed's own box or the global search -- showed
   the served-nothing message: a reader who mistyped was told the pipeline had
   produced nothing. The query is the narrowest cut, so it is named first. */
export function emptyFeedNote({ tile, dirFilter, query, globalQuery } = {}) {
  const q = String(query || globalQuery || "").trim();
  if (q) return `no signals match "${q}"`;
  if (tile || (dirFilter && dirFilter !== "all")) return "no signals match this filter";
  return "no signals served yet";
}
