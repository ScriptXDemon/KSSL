/* orgident.js — defense-CI partner identity, at serve time.
 *
 * The extraction pipeline mints a "partner" from ANY two named orgs an LLM sees in one
 * sentence with a relationship word between them, and never canonicalises. On staging
 * that produced: garbage labels ("1,400 Australian companies"), one firm split per
 * country ("Lockheed Martin Australia" vs "Lockheed Martin" as separate nodes), and a
 * dead overlap join. The pipeline gate that would stop this runs on the fleet and does
 * not reach a git deploy (see memory: enrich loop on the fleet), so this is the
 * serve-time port: a JUNK GATE (spec §4) + a CANONICALISER (spec §5). Both the graph
 * (partners.js) and the overlap matcher (overlap.js) key on these, so identity is
 * decided in exactly one place. Verified in orgident.test.mjs.
 */

export const fold = (s) =>
  String(s == null ? "" : s)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* Line-of-business / filler tokens: present in a name but not identifying. Used only to
   decide what is DISTINCTIVE (for the containment merge); never stripped from the key. */
const GENERIC = new Set(
  "defence defense systems system aerospace industries industry technologies technology solutions international group holdings holding corporation company advanced global marine naval motors engineering works enterprises the of and".split(" "),
);

/* Legal-form tokens stripped from the tail of a name. */
const LEGAL = new Set(
  "inc incorporated corp corporation co company ltd limited pvt private plc llc llp gmbh ag sa sas srl spa ab as oy oyj bv nv pty pte kk kg ohg".split(" "),
);

/* A trailing national qualifier is not a different company — it is a country attribute. */
const NATIONAL = {
  australia: "Australia", australian: "Australia", canada: "Canada", canadian: "Canada",
  uk: "United Kingdom", britain: "United Kingdom", british: "United Kingdom",
  usa: "United States", us: "United States", america: "United States", american: "United States",
  india: "India", indian: "India", germany: "Germany", german: "Germany",
  france: "France", french: "France", italy: "Italy", italian: "Italy",
  spain: "Spain", spanish: "Spain", poland: "Poland", polish: "Poland",
  norway: "Norway", norwegian: "Norway", sweden: "Sweden", swedish: "Sweden",
  finland: "Finland", finnish: "Finland", israel: "Israel", israeli: "Israel",
  japan: "Japan", japanese: "Japan", korea: "South Korea", korean: "South Korea",
  brazil: "Brazil", brazilian: "Brazil", turkey: "Türkiye", turkiye: "Türkiye", turkish: "Türkiye",
  netherlands: "Netherlands", dutch: "Netherlands",
};

/* Small, curated identity folds for known corpus confusions — NOT a gazetteer. */
const ALIASES = {
  "hindustan aeronautics": "Hindustan Aeronautics", hal: "Hindustan Aeronautics",
  "hanwha defense": "Hanwha Aerospace", "hanwha aerospace": "Hanwha Aerospace", hanwha: "Hanwha Aerospace",
  "rafael advanced defense": "Rafael Advanced Defense Systems",
  "rafael advanced defence": "Rafael Advanced Defense Systems", rafael: "Rafael Advanced Defense Systems",
};

/* ---------- JUNK GATE (spec §4) ---------- */
const COLLECTIVE = new Set(
  "companies company firms firm suppliers supplier vendors vendor partners partner customers customer clients client subcontractors contractors contractor manufacturers makers oems oem smes sme msmes msme startups enterprises businesses players stakeholders primes integrators agencies entities organisations organizations consortium consortia industry ecosystem allies nations countries governments ministries universities institutes laboratories labs".split(" "),
);
const PLACES = new Set(
  "india china usa united states us uk united kingdom britain france germany australia israel russia ukraine poland japan korea south korea north korea brazil turkey turkiye europe asia africa america middle east indo pacific nato gulf scandinavia nordics spain italy norway sweden finland netherlands canada".split(" "),
);
const FORCE_RX = /\b(ministr|min\.?\s*of\s*def|mod\b|dow\b|army|navy|air\s?force|coast guard|national guard|gendarmerie|bundeswehr|bundesministerium|government|govt\b|department of defen|dept\.?\s*of\s*defen|parliament|cabinet|secretariat|sovereign fund)/i;
const QTY_RX = /^\s*(?:over|about|around|approx\.?|approximately|more than|nearly|up to|some|at least|almost)?\s*[\d][\d.,]*\s*\+?\s+\S/i;
const VAGUE_RX = /^(a few|several|many|numerous|dozens?|hundreds?|thousands?|scores?|multiple|various|assorted|countless|a number of|a handful of|a range of)\b/i;

/* True if this label should never have become a partner. */
export function isJunkPartner(label) {
  const raw = String(label == null ? "" : label).trim();
  if (!raw) return true;
  if (QTY_RX.test(raw)) return true; // "1,400 Australian companies", "70 SMEs", "over 200 suppliers"
  if (VAGUE_RX.test(raw)) return true; // "several suppliers", "dozens of firms"
  if (raw.length > 60) return true; // a sentence fragment, not a company name
  const base = raw.replace(/^the\s+/i, "").trim();
  const n = fold(base);
  if (!n) return true;
  const toks = n.split(" ").filter(Boolean);
  if (COLLECTIVE.has(n)) return true; // whole label is a bare collective ("companies")
  if (toks.every((t) => PLACES.has(t) || NATIONAL[t])) return true; // whole label is place(s)/demonym: "United Kingdom", "Europe"
  if (FORCE_RX.test(base)) return true; // army / ministry / government (not a peer partner)
  if (!/[A-Z]/.test(base) && !/\d/.test(base)) return true; // no proper-noun capitalisation
  if (toks.some((t) => COLLECTIVE.has(t))) {
    // a collective word plus a number/demonym, nothing distinctive left: "75 British aerospace SMEs"
    const distinctive = toks.filter(
      (t) => !COLLECTIVE.has(t) && !GENERIC.has(t) && !PLACES.has(t) && !NATIONAL[t] && !/^\d/.test(t),
    );
    if (!distinctive.length) return true;
  }
  return false;
}

const titleCase = (s) =>
  String(s || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

/* ---------- CANONICALISER (spec §5) ----------
   One organisation -> one identity. Strips a parenthetical, trailing legal suffixes and a
   trailing national qualifier (kept as `country`), then applies the small ALIASES map.
   `distinctive` (name tokens minus generics/places/demonyms) drives the containment merge
   in partners.js, which collapses "Lockheed Martin Skunk Works" into "Lockheed Martin". */
export function orgCanonical(label) {
  const raw = String(label == null ? "" : label).replace(/\(.*?\)/g, " ").trim();
  let toks = fold(raw).split(" ").filter(Boolean);
  while (toks.length > 1 && LEGAL.has(toks[toks.length - 1])) toks.pop();
  let country = null;
  if (toks.length > 1 && NATIONAL[toks[toks.length - 1]]) {
    const head = toks.slice(0, -1);
    // strip the qualifier only if a real identifying token remains ("Israel Aerospace
    // Industries" must NOT collapse to "Israel")
    if (head.some((t) => !GENERIC.has(t) && !PLACES.has(t) && !NATIONAL[t])) {
      country = NATIONAL[toks[toks.length - 1]];
      toks = head;
    }
  }
  const head = toks.join(" ");
  let name = null;
  if (ALIASES[head]) name = ALIASES[head];
  else {
    for (const ak of Object.keys(ALIASES)) {
      if (head === ak || head.startsWith(ak + " ")) { name = ALIASES[ak]; break; }
    }
  }
  const display = name || titleCase(head) || raw;
  const key = (name ? fold(name) : head).replace(/\s+/g, "") || fold(raw).replace(/\s+/g, "");
  const distinctive = (name ? fold(name).split(" ") : toks).filter(
    (t) => t && !GENERIC.has(t) && !PLACES.has(t) && !NATIONAL[t],
  );
  return { key, name: display, country, tokens: name ? fold(name).split(" ") : toks, distinctive };
}

/* The bare canonical key, for callers that only need to compare identity (overlap.js). */
export const orgKey = (label) => orgCanonical(label).key;

/* Given a set of partner labels, return label(raw) -> canonical key, with a containment
   merge so "Lockheed Martin Skunk Works" folds into "Lockheed Martin". Containment fires
   only when the shorter name's DISTINCTIVE tokens are all present in the longer's — so
   "Israel Aerospace Industries" and "Israel Weapon Industries" (share only generics) stay
   apart, and "General Dynamics"/"General Atomics" (distinctive dynamics vs atomics) stay
   apart. Returns { keyOf(label), canon:{key->{name,countries[]}} }. */
export function canonicalizeLabels(labels) {
  const info = new Map(); // key -> {name, tokens, distinctive, countries:Set}
  const keyOfLabel = new Map();
  (labels || []).forEach((lbl) => {
    const c = orgCanonical(lbl);
    keyOfLabel.set(lbl, c.key);
    const cur = info.get(c.key) || { name: c.name, tokens: c.tokens, distinctive: c.distinctive, countries: new Set() };
    if (c.name.length < cur.name.length) cur.name = c.name; // shortest display wins
    if (c.country) cur.countries.add(c.country);
    info.set(c.key, cur);
  });
  // containment merge: map a longer key onto a shorter one it fully contains (distinctively)
  const keys = [...info.keys()].sort((a, b) => info.get(a).tokens.length - info.get(b).tokens.length);
  const remap = {};
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const ia = info.get(a);
    if (!ia.distinctive.length) continue; // no distinctive token -> never absorbs anything
    for (let j = i + 1; j < keys.length; j++) {
      const b = keys[j];
      if (remap[b]) continue;
      const ib = info.get(b);
      const bset = new Set(ib.tokens);
      if (ia.tokens.length < ib.tokens.length && ia.distinctive.every((t) => bset.has(t))) {
        remap[b] = a;
        ib.countries.forEach((x) => ia.countries.add(x));
      }
    }
  }
  const resolve = (k) => { let g = 0; while (remap[k] && g++ < 8) k = remap[k]; return k; };
  const keyOf = (lbl) => resolve(keyOfLabel.get(lbl) || orgCanonical(lbl).key);
  const canon = {};
  keys.forEach((k) => {
    const r = resolve(k);
    canon[r] = canon[r] || { name: info.get(r).name, countries: new Set() };
    info.get(k).countries.forEach((x) => canon[r].countries.add(x));
    if (info.get(k).name.length < canon[r].name.length) canon[r].name = info.get(k).name;
  });
  Object.keys(canon).forEach((k) => { canon[k].countries = [...canon[k].countries].sort(); });
  return { keyOf, canon };
}
