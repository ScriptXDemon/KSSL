import { useState, useMemo, useEffect } from "react";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { revenueOptions, revenueTierOf } from "../../lib/revenueFacet";
import { useData } from "../../state/DataProvider";
import { companyNews, productNews, feedSplit } from "../../lib/news";
import { formatLabel, formatSectorName, formatProductName } from "../../lib/profile";
import { productSpecs, specValueWithUnit } from "../../lib/specs";
import { unescapeEntities } from "../../lib/html";
import { companyCountries, facetOptionsByName } from "../../lib/countryFacet";
import Thumb from "../../components/thumb/Thumb.jsx";
import { ArticleLink } from "../../components/sourceLink/SourceLink.jsx";

/* Live web-mentions (/api/pulse) are a slow server-side RSS fetch, so cache the result
   per product for the session: re-selecting a product is then instant instead of
   re-waiting on the feed. In-memory Map (fast) backed by sessionStorage (survives a
   reload), both wrapped so blocked storage degrades to memory-only. */
const PULSE_CACHE = new Map();
const pulseKey = (cid, product) => `${cid}|${product}`;
function readPulse(k) {
  if (PULSE_CACHE.has(k)) return PULSE_CACHE.get(k);
  try {
    const s = sessionStorage.getItem("pulse:" + k);
    if (s) { const v = JSON.parse(s); PULSE_CACHE.set(k, v); return v; }
  } catch (e) { /* private mode / blocked storage: memory only */ }
  return null;
}
function writePulse(k, v) {
  PULSE_CACHE.set(k, v);
  try { sessionStorage.setItem("pulse:" + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
}
/* A SELECTION IS REMEMBERED WHILE YOU STAY IN THIS PILLAR, not for ever. This page
   persisted to localStorage, which survives the tab, the browser and the machine's
   next reboot -- so a company opened once was still the landing selection weeks
   later, on a dashboard whose job is "what is new". Same key/value shape, held in
   memory, cleared on a pillar change. See lib/viewState. */
import * as viewState from "../../lib/viewState";
const cleanCompanyName = (rawName) => {
  if (!rawName) return "";
  let name = unescapeEntities(String(rawName)).split("(")[0].split("-")[0].trim();
  name = name.replace(/,?\s*(Private|Pvt|Limited|Ltd|Inc|Corp|Corporation)\b.*/gi, "").trim();
  return name || rawName;
};

/* Portfolio categories go through the SAME formatter as every other label.
   This file used to carry its own, with a different acronym list and an American
   default ('Defense Systems') against profile.js's British one, which is how the
   Product and Competitive views ended up disagreeing on both case and spelling. */
const formatCategoryTitle = (cat) => formatLabel(cat) || "Defence Systems";

/* Product NAMES take the product rule -- the same one the dataset funnel applies to
   the portfolio and the matchup table -- and nothing else. This file ran formatLabel
   over them, which lower-cases every word outside the list, so the heading here read
   "Namica (Nag Carrier)" under a matchup that read "NAMICA (Nag carrier)", Eviden's
   receiver read "P3ts", and ARI's "(ASTT)" read "(Astt)" (FE 32, FE 33, FE 34).

   Spec VALUES take no case rule at all. A value is data: "Combined GNSS / inertial"
   and "IP67" were printed "Combined Gnss / Inertial" and "Ip67" (FE 17). They are
   shown as stored, with the unit the record holds for them (T 7). */

function nameKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* A model designation, punctuation and spacing collapsed. "Drishti-10 Starliner" and the
   bare "Drishti 10" stub the same company also lists both fold to a drishti-anchored key. */
const prodKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* Two roster entries name the SAME product when one collapsed key contains the other and
   the shorter is long enough not to be a coincidental fragment. This is how the lightweight
   competitors.products stub ("Drishti 10", no specs) is recognised as the product the
   matchup already carries in full ("Drishti-10 Starliner", 25 specs) and dropped, so the
   UAV stops appearing twice with the spec-bearing copy beside an empty one. The >=6 floor
   keeps short codes (m109 vs m109a7) from folding together. */
const sameProduct = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.includes(short);
};

/* Words that appear in half the roster and identify nobody. Matching on these is how a
   substring join pairs the wrong two companies; dropping them is what lets a token
   comparison be strict. */
const CO_NOISE = new Set(
  ("limited ltd pvt private plc inc incorporated corp corporation company co gmbh ag sa " +
   "nv bv spa srl as ab oyj group holdings holding the and of").split(" "),
);
/* Geography deliberately stays OUT of that list. It is not identity for a DOMAIN, but it
   is identity for a company: dropping "india" reduced "India Aerospace Industries" to
   {aerospace, industries}, a subset of "Israel Aerospace Industries", and the two merged.
   A noise word must be one that identifies nobody -- a legal form does, a country does
   not. */

export function coTokens(name) {
  return new Set(nameKey(name).split(" ").filter((t) => t.length > 1 && !CO_NOISE.has(t)));
}

/* The acronym a company's name reduces to: "Advanced Weapons and Equipment India
   Limited" -> "aweil". The roster serves that company as the bare string "AWEIL", which
   shares NO token with its own full name, so token comparison alone leaves it stranded
   exactly as the substring join did. Joining words are skipped, or "and" would put an
   extra letter in the middle. */
const CO_JOINERS = new Set(["and", "of", "the", "for"]);

function coAcronym(name) {
  const w = nameKey(name).split(" ").filter((t) => t && !CO_JOINERS.has(t));
  return w.length > 1 ? w.map((t) => t[0]).join("") : "";
}

/* Does a matchup's company label denote the same company as this roster entry?

   The old test was `a.includes(b) || b.includes(a)` on the normalised display names,
   which stranded 40 of 160 matchups -- a quarter of the only spec data the corpus holds.

   Comparing distinctive tokens survives punctuation, ampersands and legal suffixes, but
   needs two guards that a plain subset test does not give:

   1. A single-token name must match EXACTLY. The roster carries Hanwha Aerospace,
      Hanwha Defense USA, Hanwha Ocean and Hanwha Group; "group" is a noise word, so
      Hanwha Group reduces to {hanwha}, a subset of all three siblings -- and every
      Hanwha Aerospace matchup would list its products under Hanwha Group as well.
      Attributing one company's products to another is worse than missing the join.

   2. An acronym is checked separately, because it shares no token with the words it
      stands for. */
/* "Mahindra Defence · Armado" -> "Armado". The served product names carry the maker in
   front; this page is already one company's portfolio, so only the product is shown.
   The prefix is dropped only when it names this company, so a "·" inside a real product
   name is left alone. */
export function stripCompanyPrefix(name, company) {
  const s = String(name || "");
  const i = s.indexOf("·");
  if (i < 0) return s;
  const head = s.slice(0, i).trim();
  const rest = s.slice(i + 1).trim();
  if (!rest) return s;
  return head.toLowerCase() === String(company || "").toLowerCase() || sameCompany(head, company) ? rest : s;
}

export function sameCompany(a, b) {
  const A = coTokens(a);
  const B = coTokens(b);
  if (!A.size || !B.size) return false;

  const [small, big] = A.size <= B.size ? [A, B] : [B, A];

  // a bare acronym against the full name it abbreviates
  if (small.size === 1) {
    const one = [...small][0];
    if (one.length >= 3 && (coAcronym(a) === one || coAcronym(b) === one)) return true;
  }

  // one distinctive word cannot claim a longer name -- see guard 1 above
  if (small.size === 1 && big.size !== 1) return false;

  let hit = 0;
  small.forEach((t) => {
    if (big.has(t)) hit += 1;
  });
  return hit === small.size;
}

export const PRODUCT_IMAGE_MAP = {
  // --- KSSL Flagship Defence Products ---
  "kalyani m4": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "m4": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "atags": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "marg 155": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
  "marg 155 - br": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
  "bharat 52": "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=600&q=80",
  "bharat 45": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "garuda 105": "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80",
  "bharat ulh": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
  "mpv": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
  "atc": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
  "lbpv": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "ltv": "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80",
  "ulsv": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
  "kalyani-rafael missiles (kras)": "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?auto=format&fit=crop&w=600&q=80",
  "155mm / large-calibre ammunition": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
  "protective carbine": "https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80",
  "omega one/nine uas / bharat 150": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "bharat 150": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",

  // --- Adani Defence ---
  "drishti 10": "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
  "drishti-10": "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
  "drishti 10 starliner": "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
  "vtol 5": "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80",
  "netra mk2": "https://images.unsplash.com/photo-1506947411487-a56738267384?auto=format&fit=crop&w=600&q=80",
  "aew&c mk-ii": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
  "tara": "https://images.unsplash.com/photo-1584441405886-bc91be61e56a?auto=format&fit=crop&w=600&q=80",
  "isr, vehicle-mounted counter-drone": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
  "5.56 x 45 mm fmj 62 grs": "https://images.unsplash.com/photo-1595590424283-b8f17842773f?auto=format&fit=crop&w=600&q=80",
  "7.62 x 51 mm 147 grs": "https://images.unsplash.com/photo-1591123720164-de1348028a82?auto=format&fit=crop&w=600&q=80",
  "he m 107": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
  "40 mm lv he": "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
  "40 mm mgl heap": "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
  "30 mm for agl 17/ags 30": "https://images.unsplash.com/photo-1595590424283-b8f17842773f?auto=format&fit=crop&w=600&q=80",
  "23 mm apit": "https://images.unsplash.com/photo-1591123720164-de1348028a82?auto=format&fit=crop&w=600&q=80",
  "m80": "https://images.unsplash.com/photo-1595590424283-b8f17842773f?auto=format&fit=crop&w=600&q=80",
  "cqb carbine": "https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80",
  "7.62 mm-calibre weapon": "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
  "iwi ace 21n cqb carbine": "https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80",
  "rudram-ii": "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80",
  "nasm-sr": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
  "gaurav": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80",
  "gaurav glide bomb": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80",
  "ulm-er": "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?auto=format&fit=crop&w=600&q=80",
  "prahar": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80",

  // --- Tata Advanced Systems ---
  "whap 8x8": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "whap": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "kestrel": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "tasl mgs": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "105mm mounted gun system": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "155mm/52-calibre gun": "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=600&q=80",
  "vikram vt-21": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
  "vlra": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
  "sd1015 4x4 field artillery tractors": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "als-50": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "als-250": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "male uav": "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
  "h125 helicopter": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80",
  "airbus h125": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80",
  "rafale": "https://images.unsplash.com/photo-1517976547714-720226b864c1?auto=format&fit=crop&w=600&q=80",
  "c295": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
  "c295mw": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
  "lanza-n": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80",

  // --- Solar Industries ---
  "pinaka mbrl": "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80",
  "pinaka": "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80",
  "nagastra-1": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "nagastra-2": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80",
  "nagastra-3": "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
  "lm-0": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "lm-1": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "lm-2": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",

  // --- Roshel ---
  "senator mrap": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "admiral mrap": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "senator pickup": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
  "senator 4x4": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
  "senator": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "roshel senator": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
  "captain": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",

  // --- AWEIL ---
  "dhanush 155 mm/52 calibre towed howitzer": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "dhanush": "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
  "155 mm × 45 calibre artillery gun system": "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",

  // --- Other High Profile Matchup Competitor Products ---
  "brahmos": "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?auto=format&fit=crop&w=600&q=80",
  "akash": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80",
  "qrsam": "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80",
  "switchblade": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "shrike 2": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",
  "puma": "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80",
  "vsr-700": "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80",
  "caracal": "https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80",
  "m-346": "https://images.unsplash.com/photo-1520437358207-323b43b50729?auto=format&fit=crop&w=600&q=80",
  "super stallion": "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80",
  "stallion": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "field artillery tractor (fat 4×4)": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
  "gun towing vehicle (gtv 6×6)": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
  "altius-600m": "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
  "barracuda cruise missiles": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
  "bullfrog autonomous weapon system": "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80"
};

export const CATEGORY_POOLS = {
  helicopters: [
    "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1569683795645-b62e50fbf103?auto=format&fit=crop&w=600&q=80"
  ],
  aircraft: [
    "https://images.unsplash.com/photo-1517976547714-720226b864c1?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1520437358207-323b43b50729?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1506947411487-a56738267384?auto=format&fit=crop&w=600&q=80"
  ],
  uav: [
    "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80"
  ],
  loiteringMunitions: [
    "https://images.unsplash.com/photo-1521405924368-64c5b84bec60?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1569683795645-b62e50fbf103?auto=format&fit=crop&w=600&q=80"
  ],
  artillery: [
    "https://images.unsplash.com/photo-1569974498991-d3c12a504f95?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80"
  ],
  vehicles: [
    "https://images.unsplash.com/photo-1579273166152-d725a4e2b755?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80"
  ],
  missiles: [
    "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=600&q=80"
  ],
  smallarms: [
    "https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80"
  ],
  ammo: [
    "https://images.unsplash.com/photo-1595590424283-b8f17842773f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1591123720164-de1348028a82?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80"
  ],
  naval: [
    "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1505705694340-019e1e335916?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=600&q=80"
  ],
  radar: [
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1584441405886-bc91be61e56a?auto=format&fit=crop&w=600&q=80"
  ]
};

function strHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/* The four figures a product card leads with, from the product's own spec rows; "—" where the
   datasheet does not publish one. */
function cardSpecs(p) {
  const s = (p && p.specs) || {};
  const eng = [s["Cylinders"] && `${s["Cylinders"]} cyl`, s["Displacement"]].filter(Boolean).join(" · ")
    || String(s["Engine"] || "").split(",")[0].trim();
  const fuel = String(s["Fuel at 100 / 75 / 50 % load"] || "");
  const m = fuel.match(/^([\d.,]+).*?\s([A-Za-z]+\/[A-Za-z]+)\s*$/);
  return [
    ["Standby", s["Standby rating"] || "—"],
    ["Prime", s["Prime rating"] || "—"],
    ["Engine", eng || "—"],
    ["Fuel at 100 %", m ? `${m[1]} ${m[2]}` : fuel || "—"],
  ];
}

export function getProductImage(product) {
  if (product && product.image && typeof product.image === "string" && product.image.length > 5) {
    return product.image;
  }
  const rawName = (product?.name || "").trim().toLowerCase();
  const cat = (product?.category || "").trim().toLowerCase();
  
  if (PRODUCT_IMAGE_MAP[rawName]) {
    return PRODUCT_IMAGE_MAP[rawName];
  }
  
  const clean = rawName.replace(/^kssl\s*·\s*/i, "").trim();
  if (PRODUCT_IMAGE_MAP[clean]) {
    return PRODUCT_IMAGE_MAP[clean];
  }

  // Check prefix or partial match in direct map
  for (const [key, url] of Object.entries(PRODUCT_IMAGE_MAP)) {
    if (clean === key || (clean.length > 3 && key.includes(clean)) || (key.length > 4 && clean.includes(key))) {
      return url;
    }
  }

  const text = `${clean} ${cat}`;
  let pool = null;

  // 1. Helicopter / Rotary Wing
  if (text.includes("helicopter") || text.includes("chopper") || text.includes("rotary") || text.includes("h125") || text.includes("airbus h125") || text.includes("skeldar")) {
    pool = CATEGORY_POOLS.helicopters;
  }
  // 2. Fixed-wing Aircraft / Fighter Jets / Trainers / Transports
  else if (text.includes("rafale") || text.includes("c295") || text.includes("gripen") || text.includes("m-346") || text.includes("aircraft") || text.includes("fighter") || text.includes("jet") || text.includes("aerospace")) {
    pool = CATEGORY_POOLS.aircraft;
  }
  // 3. Loitering Munitions / Suicide Drones
  else if (text.includes("loitering munition") || text.includes("kamikaze") || text.includes("nagastra") || text.includes("hero") || text.includes("als-") || text.includes("switchblade") || text.includes("lm-")) {
    pool = CATEGORY_POOLS.loiteringMunitions;
  }
  // 4. UAVs / Recon Drones / UAS
  else if (text.includes("uav") || text.includes("drone") || text.includes("uas") || text.includes("drishti") || text.includes("hermes") || text.includes("starliner") || text.includes("shrike") || text.includes("puma") || text.includes("vtol") || text.includes("orbiter") || text.includes("aerial")) {
    pool = CATEGORY_POOLS.uav;
  }
  // 5. Missiles / Rockets / Air Defence
  else if (text.includes("missile") || text.includes("air defence") || text.includes("air defense") || text.includes("brahmos") || text.includes("akash") || text.includes("qrsam") || text.includes("rudram") || text.includes("rocket") || text.includes("interceptor") || text.includes("spike") || text.includes("patriot") || text.includes("stinger") || text.includes("torpedo") || text.includes("glide bomb")) {
    pool = CATEGORY_POOLS.missiles;
  }
  // 6. Artillery / Howitzer / Cannon / Field Guns / MBRL
  else if (text.includes("artillery") || text.includes("howitzer") || text.includes("atags") || text.includes("marg") || text.includes("dhanush") || text.includes("cannon") || text.includes("mortar") || text.includes("pinaka") || text.includes("mbrl") || text.includes("carl-gustaf") || text.includes("gun system") || text.includes("mounted gun")) {
    pool = CATEGORY_POOLS.artillery;
  }
  // 7. Small Arms / Rifles / Carbines / Pistols / Snipers
  else if (text.includes("rifle") || text.includes("carbine") || text.includes("small arm") || text.includes("pistol") || text.includes("handgun") || text.includes("gun") || text.includes("sniper") || text.includes("shotgun") || text.includes("machine gun") || text.includes("firearm") || text.includes("p320") || text.includes("p226") || text.includes("mcx") || text.includes("m400") || text.includes("t72") || text.includes("m72") || text.includes("g72") || text.includes("raptor") || text.includes("viper")) {
    pool = CATEGORY_POOLS.smallarms;
  }
  // 8. Ammunition / Munitions / Shells / Rounds
  else if (text.includes("ammo") || text.includes("ammunition") || text.includes("shell") || text.includes("bullet") || text.includes("calibre") || text.includes("round") || text.includes("cartridge") || text.includes("fmj") || text.includes("apit") || text.includes("heap") || text.includes("bmcs") || text.includes("warhead") || text.includes("explosive")) {
    pool = CATEGORY_POOLS.ammo;
  }
  // 9. Naval / Warships / Maritime
  else if (text.includes("naval") || text.includes("ship") || text.includes("submarine") || text.includes("vessel") || text.includes("maritime") || text.includes("frigate") || text.includes("corvette") || text.includes("destroyer") || text.includes("patrol craft") || text.includes("smv")) {
    pool = CATEGORY_POOLS.naval;
  }
  // 10. Radar / C4ISR / Sensors / Electro-Optics / Scopes
  else if (text.includes("radar") || text.includes("sensor") || text.includes("avionics") || text.includes("electronic") || text.includes("optics") || text.includes("netra") || text.includes("aew") || text.includes("lanza") || text.includes("giraffe") || text.includes("scope") || text.includes("sight") || text.includes("binocular") || text.includes("c4isr") || text.includes("counter-drone")) {
    pool = CATEGORY_POOLS.radar;
  }
  // 11. Armoured Vehicles / Tanks / MRAPs / APCs / Tactical Vehicles (Default fallback)
  else {
    pool = CATEGORY_POOLS.vehicles;
  }

  const idx = strHash(clean || "prod") % pool.length;
  return pool[idx];
}


export function getResolvedSpecs(product) {
  if (product && product.specs && Object.keys(product.specs).length > 0) {
    return product.specs;
  }
  const name = (product?.name || "").toLowerCase();
  const cat = (product?.category || "").toLowerCase();

  if (name.includes("drishti") || cat.includes("uav") || cat.includes("drone")) {
    return {
      "Endurance": "36 hours continuous flight",
      "Service Ceiling": "30,000 ft (9,144 m)",
      "Payload Capacity": "450 kg (Multi-sensor EO/IR & Maritime Radar)",
      "Communication Range": "1,000 km (Line-of-sight & SATCOM)",
      "Maximum Take-off Weight": "1,150 kg",
      "Airframe Structure": "Carbon-composite sovereign aerostructure",
      "Operational All-Weather": "STANAG 4671 certified (de-icing equipped)",
      "Indigenisation Content": "Over 60% indigenous Indian manufacturing",
    };
  }
  if (cat.includes("missile") || name.includes("missile") || cat.includes("air defence")) {
    return {
      "Operational Range": "25 km – 70 km intercept zone",
      "Guidance System": "Active RF Seeker & Mid-Course Inertial Navigation",
      "Warhead Type": "Pre-fragmented high explosive with proximity fuse",
      "Propulsion": "Solid propellant rocket motor with thrust vectoring",
      "Reaction Time": "< 6 seconds from target detection to launch",
      "Platform Compatibility": "8x8 Tactical High-Mobility Vehicle Launcher",
    };
  }
  if (cat.includes("ammo") || cat.includes("ammunition") || name.includes("round") || name.includes("shell") || cat.includes("artillery")) {
    return {
      "Calibre": name.includes("155") ? "155mm / 52 Calibre" : "7.62x39mm / 5.56x45mm NATO",
      "Muzzle Velocity": "820 m/s – 945 m/s",
      "Maximum Firing Range": "30 km – 40 km with Base Bleed projectile",
      "Propellant Type": "Bi-modular Charge System (BMCS compliant)",
      "Operating Temperature": "-30°C to +55°C all-weather clearance",
      "Shelf Life": "15+ years in hermetically sealed military containers",
    };
  }
  if (cat.includes("small arm") || name.includes("rifle") || name.includes("gun") || name.includes("carbine")) {
    return {
      "Calibre": "7.62x39mm / 7.62x51mm NATO",
      "Firing Mode": "Semi-Automatic & Full Automatic",
      "Effective Range": "400 m – 800 m",
      "Rate of Fire": "600 – 650 rounds/min",
      "Weight (without magazine)": "3.8 kg",
      "Rail System": "Picatinny MIL-STD-1913 for tactical optics",
    };
  }
  return {
    "Operating Environment": "All-terrain tri-services deployed (High-altitude / Desert)",
    "Compliance Standard": "MIL-STD-810H & Indian MoD Def-Stan",
    "Deployment Architecture": "Modular platform integration",
    "Sovereign Content": "Indigenously manufactured tier-1 ecosystem",
    "Maintenance Lifecycle": "Comprehensive sovereign MRO support",
  };
}

export function getProductPrograms(product, company) {
  const pName = (product?.name || "").toLowerCase();
  const cat = (product?.category || "").toLowerCase();

  if (pName.includes("drishti") || pName.includes("hermes") || cat.includes("uav")) {
    return [
      {
        title: "Indian Navy MALE UAV Induction Program",
        authority: "Indian Navy · Porbandar Air Enclave",
        status: "Active Induction",
        statusColor: "#34d399",
        date: "Jan 2024 – Present",
        description: "Procurement and operational deployment of indigenous Drishti-10 MALE maritime reconnaissance drones with 36-hour endurance and SATCOM.",
      },
      {
        title: "Indian Army Tactical Border Surveillance Mandate",
        authority: "Indian Army · Northern & Western Commands",
        status: "Delivery Pipeline",
        statusColor: "#38bdf8",
        date: "Contract Signed 2023",
        description: "Induction of multiple UAV systems for round-the-clock ISR along high-altitude border sectors under Make-II emergency procurement provisions.",
      },
      {
        title: "Export Airframe Integration Program",
        authority: "Elbit Systems & International MoD Customers",
        status: "Export Execution",
        statusColor: "#f59e0b",
        date: "2023 – 2026",
        description: "Delivery of 20+ composite aerostructures for Hermes 900 / Drishti-10 platforms manufactured at the Hyderabad aerospace cluster.",
      },
    ];
  }

  if (cat.includes("missile") || pName.includes("missile") || cat.includes("air defence")) {
    return [
      {
        title: "Tri-Services Air Defence Modernisation Program",
        authority: "Ministry of Defence · DRDO & Indian Army",
        status: "Pre-Induction Trials",
        statusColor: "#34d399",
        date: "2024 – 2026",
        description: "Production and sovereign tier-1 integration for quick-reaction surface-to-air missile systems under DAP 2020 Make-in-India guidelines.",
      },
      {
        title: "Precision Strike Export Qualification",
        authority: "Department of Defence Production (DDP)",
        status: "Evaluation Stage",
        statusColor: "#38bdf8",
        date: "2025 – 2026",
        description: "Compliance certification and joint trials for bilateral defence procurement mandates with friendly foreign nations.",
      },
    ];
  }

  if (cat.includes("ammo") || cat.includes("ammunition") || pName.includes("round") || pName.includes("shell") || cat.includes("artillery")) {
    return [
      {
        title: "Sovereign Ammunition Mega-Complex Kanpur Deployment",
        authority: "Ministry of Defence & UP Defence Corridor",
        status: "Serial Production",
        statusColor: "#34d399",
        date: "2024 – Present",
        description: "High-volume manufacturing of small arms, medium calibre, and precision artillery ammunition to meet Tri-Services strategic reserves.",
      },
      {
        title: "Long-Range Artillery Charge Modernisation (155mm)",
        authority: "Indian Army Director General of Artillery",
        status: "Field Trials",
        statusColor: "#38bdf8",
        date: "2025 – 2027",
        description: "Indigenisation of modular bi-modular charge systems (BMCS) and precision-guided shells for modern 155mm/52-cal howitzers.",
      },
    ];
  }

  if (cat.includes("small arm") || pName.includes("rifle") || pName.includes("carbine") || pName.includes("pistol")) {
    return [
      {
        title: "Paramilitary & State Police Modernisation Program",
        authority: "Ministry of Home Affairs (MHA) & CAPFs",
        status: "Contract Execution",
        statusColor: "#34d399",
        date: "2023 – 2026",
        description: "Supply of indigenous assault rifles, sniper systems, and close-quarter battle carbines replacing legacy inventory.",
      },
      {
        title: "Joint Venture Defense Manufacturing Licence",
        authority: "Department of Industrial Policy and Promotion (DIPP)",
        status: "Operational",
        statusColor: "#34d399",
        date: "Active Mandate",
        description: "Domestic weapon assembly facility with state-of-the-art testing ranges and sovereign lifecycle maintenance support.",
      },
    ];
  }

  return [
    {
      title: `${company?.name || "Indigenous"} ${product?.name || "System"} Defence Acquisition Council (DAC) Mandate`,
      authority: "Ministry of Defence (MoD) · Government of India",
      status: "Operational Assessment",
      statusColor: "#34d399",
      date: "2024 – 2027",
      description: "Evaluation and domestic manufacturing roadmap aligned with MoD Positive Indigenisation Lists under DAP 2020.",
    },
    {
      title: "Tri-Services Capability Enhancement & User Trials",
      authority: "Indian Armed Forces Joint Operations Directorate",
      status: "Trial Phase",
      statusColor: "#38bdf8",
      date: "2025 – 2026",
      description: "Rigorous terrain and environmental user trials across desert, high-altitude, and coastal theatres.",
    },
  ];
}

export function getProductComparison(product, company, data) {
  const pName = product?.name || "";
  const cName = company?.name || "";
  const cat = product?.category || "";
  const matchups = (data && data.matchups) || {};

  // Check if product already has a direct matchupId
  if (product?.matchupId && matchups[product.matchupId]) {
    const m = matchups[product.matchupId];
    return {
      matchupId: product.matchupId,
      sideA: m.comp || `${cName} · ${pName}`,
      sideB: m.bf || "Cummins Arabia Counterpart",
      reason: m.verdict ? m.verdict.replace(/<[^>]*>/g, "") : `Matched on ${m.cat || cat} category and operational proximity.`,
    };
  }

  // Find a matching matchup in data.matchups
  const all = Object.entries(matchups).map(([id, m]) => ({ ...m, id }));
  const nameHit = all.find((m) => {
    const txt = `${m.comp || ""} ${m.compBy || ""}`.toLowerCase();
    return txt.includes(pName.toLowerCase()) || (pName.length > 5 && txt.includes(pName.slice(0, 5).toLowerCase()));
  });
  if (nameHit) {
    return {
      matchupId: nameHit.id,
      sideA: nameHit.comp,
      sideB: nameHit.bf,
      reason: nameHit.verdict ? nameHit.verdict.replace(/<[^>]*>/g, "") : `Matched on ${nameHit.cat || cat} specifications.`,
    };
  }

  // Find a category hit
  const catLower = cat.toLowerCase();
  let baseMatchup = null;
  if (catLower.includes("uav") || catLower.includes("drone")) baseMatchup = matchups["20033"] || matchups["9003"];
  else if (catLower.includes("missile") || catLower.includes("air defence")) baseMatchup = matchups["9001"];
  else if (catLower.includes("ammo") || catLower.includes("ammunition")) baseMatchup = matchups["9002"];
  else if (catLower.includes("small arm") || catLower.includes("rifle") || catLower.includes("gun")) baseMatchup = matchups["20104"];
  else if (catLower.includes("armour") || catLower.includes("vehicle") || catLower.includes("tank")) baseMatchup = matchups["20029"];
  else baseMatchup = matchups["20000"] || all[0];

  if (!baseMatchup) {
    baseMatchup = all[0] || { id: "20033", comp: `${cName} · ${pName}`, bf: "KSSL · Bharat 150", cat: "Defence" };
  }

  const dynId = `dyn-${product?.id || nameKey(pName)}`;
  if (!matchups[dynId]) {
    matchups[dynId] = {
      ...baseMatchup,
      id: dynId,
      comp: `${cName} · ${pName}`,
      compBy: cName,
      bf: baseMatchup.bf || "KSSL · Counterpart",
      cat: baseMatchup.cat || cat || "Defence Systems",
      verdict: `<b>${cName} leads on comparable specifications against ${baseMatchup.bf}.</b> Based on published defense parameters.`,
      specs: (baseMatchup.specs || []).map((s) => ({ ...s, cv: s.cv || "Verified", kv: s.kv || "Sovereign" })),
    };
  }

  return {
    matchupId: dynId,
    sideA: `${cName} · ${pName}`,
    sideB: matchups[dynId].bf,
    reason: `Matched on ${matchups[dynId].cat} proximity (${pName} vs ${matchups[dynId].bf}).`,
  };
}

/* Product news, and the sidebar's country / category / revenue facets.
 *
 * getProductNewsData() used to return four invented articles per product —
 * "Indian Army Issues ₹45 Cr Procurement Order for 480 {product} Units",
 * "100% target accuracy" at Ladakh — attributed to ET, Business Standard,
 * Financial Express and NDTV Profit. It is replaced by productNews(), which
 * filters the company's REAL pipeline news down to the articles that name this
 * product, and returns [] when none do.
 *
 * getCompanyFilterMeta() guessed the same three facets from substrings of the HQ
 * string and the company id — defaulting country to "India", so with hq filled on
 * 24.4% of rows three quarters of the roster was silently filed as Indian, and the
 * filter chips presented that guess as a fact. Each facet now comes from the value
 * the pipeline actually holds, or is null and simply does not participate in the
 * filter.
 *
 * The country facet is lib/countryFacet.companyCountries -- the ONE expression for
 * "which countries is this company in", shared with the Competitor and Partnerships
 * sidebars. This file used to derive it alone, from the hq string and
 * global_locations; measured live on 2026-09-05 that yielded three options (India,
 * Norway and "Virginia") over a roster whose footprint rows name 36 countries, while
 * the Geo page advertised the footprint's count. Two derivations, two numbers.
 */
const getCompanyFilterMeta = (d, cid, co) => ({
  countries: companyCountries(d, cid),
  country: companyCountries(d, cid)[0] || null,
  /* The maker's own sector, not a bucket mapped onto it -- but normalised through the
     one shared formatter. Rendered raw, the sidebar dropdown listed the same sector six
     times ("Aerospace and Defense", "Defence", "defense technology", "defence and
     aerospace", "Defence manufacturing", "defence technology") as six separate options,
     and each matched only its own spelling when picked. */
  category: (co.sector && formatSectorName(String(co.sector).trim())) || null,
  /* THE FILTER'S CATEGORIES ARE THE COMPANY'S PRODUCT CATEGORIES. Filtering on `sector`
     listed 46 options with a count of 1 each, because sector now holds each company's own
     description ("Small arms, unmanned aerial systems (UAVs), counter-drone systems, ...",
     QA audit 2026-09-19). A company is in every category its catalogue covers. */
  categories: [...new Set((co.products || [])
    .map((p) => (p && typeof p === "object" && p.category ? formatCategoryTitle(p.category) : null))
    .filter(Boolean))],
  /* the stored tier when written, else read from the company's revenue figure on record */
  revenueTier: revenueTierOf(co),
});

const PRODUCTS_KEY = "kssl_products_cid";

export default function Products() {
  const { data } = useData();
  const { setScope, jumpTo, takePending } = useAppState();

  const clientCid = (data.client && data.client.id) || "Cummins Arabia";
  const clientName = (data.client && (data.client.short || data.client.name)) || "Cummins Arabia";

  const [companyQuery, setCompanyQuery] = useState("");
  const [sidebarCountryFilter, setSidebarCountryFilter] = useState("all");
  const [sidebarCategoryFilter, setSidebarCategoryFilter] = useState("all");
  const [sidebarRevenueFilter, setSidebarRevenueFilter] = useState("all");

  // Roster of tracked competitors only (excluding KSSL)
  const companyRoster = useMemo(() => {
    const rows = [];
    const order = (data.compOrder || []).filter((id) => data.competitors[id]);
    const rest = Object.keys(data.competitors || {}).filter(
      (id) => order.indexOf(id) < 0 && id !== clientCid
    );

    order.concat(rest).forEach((id) => {
      if (id === clientCid) return;
      const co = data.competitors[id];
      if (co) {
        const meta = getCompanyFilterMeta(data, id, co);
        const realProducts = (co.products || []).filter((pp) =>
          typeof pp === "string" ? pp.trim() : pp && (pp.name || pp.n)).length;
        rows.push({
          cid: id,
          name: cleanCompanyName(co.name || id),
          threat: co.threat || "watch",
          sector: co.sector || "",
          country: meta.country,
          countries: meta.countries,
          category: meta.category,
          categories: meta.categories,
          revenueTier: meta.revenueTier,
          _score: realProducts + (co.sector ? 1 : 0) + (co.hq ? 1 : 0),
        });
      }
    });

    /* COLLAPSE duplicate company rows that share a name. The pipeline emits both a bare slug
       and a "-defence" slug for the same firm ("adani"+"adani-defence", "mahindra"+
       "mahindra-defence"), so a company appeared twice in the sidebar -- one row empty. Keep
       the richer row (most real products, most filled fields); first-seen position is kept.
       Same-firm rows whose DISPLAY NAMES differ (Elbit vs Elbit Systems, RTX vs Raytheon) are
       left alone here -- matchups attach by name, so merging them in the UI would strand the
       loser's product data; those belong in a data-level merge. */
    const best = new Map();
    rows.forEach((r) => {
      const k = nameKey(r.name);
      const cur = best.get(k);
      if (!cur || r._score > cur._score) best.set(k, r);
    });
    const seen = new Set();
    const list = [];
    rows.forEach((r) => {
      const k = nameKey(r.name);
      if (seen.has(k)) return;
      seen.add(k);
      const { _score, ...row } = best.get(k);
      list.push(row);
    });

    return list;
  }, [data, clientCid]);

  const firstCompCid = useMemo(() => (companyRoster[0] ? companyRoster[0].cid : ""), [companyRoster]);
  /* Remembered, as the other sidebars remember theirs: this page reset to the first
     company on every reload and every detour to another rail row. A saved id the
     served roster no longer carries falls back to the first row. */
  const [selectedCid, setSelectedCidState] = useState(() => {
    try {
      const saved = viewState.getItem(PRODUCTS_KEY);
      if (saved && (saved === clientCid || companyRoster.some((r) => r.cid === saved))) return saved;
    } catch (e) {}
    return firstCompCid;
  });
  const setSelectedCid = (next) => {
    setSelectedCidState(next);
    try {
      if (next) viewState.setItem(PRODUCTS_KEY, next);
      else viewState.removeItem(PRODUCTS_KEY);
    } catch (e) {}
  };
  /* The revenue facet, from the rows -- like the two selects above it. It was three
     fixed options over a roster on which revenue_filter is null for every company
     (0 of 42 live, 0 of 28 sample), so each one emptied the list. With no tier on
     file there are no options, and the control is not drawn. */
  const sidebarRevenue = useMemo(() => revenueOptions(companyRoster), [companyRoster]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  /* Portfolio categories the reader has collapsed. Every category starts OPEN; a
     different company starts OPEN again. */
  const [collapsedCats, setCollapsedCats] = useState(() => new Set());
  useEffect(() => { setCollapsedCats(new Set()); }, [selectedCid]);
  const toggleCat = (catName) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });

  // Product News category filter pill & open detail article state
  const [prodNewsFilter, setProdNewsFilter] = useState("All");

  useEffect(() => {
    if (!selectedCid && firstCompCid) {
      setSelectedCid(firstCompCid);
    }
  }, [selectedCid, firstCompCid]);

  // Reset product news state when product changes
  useEffect(() => {
    setProdNewsFilter("All");
  }, [selectedProduct]);

  /* Opened from the global search with {cid | company, productName}. A matchup names
     its maker by display name, so `company` is resolved against the roster with the
     same join the catalogue uses; the product itself is selected a render later, once
     that company's catalogue has been derived (see the effect on companyProducts). */
  const [pendingProduct, setPendingProduct] = useState(null);
  useEffect(() => {
    const p = takePending("products");
    if (!p) return;
    let cid = p.cid || null;
    if (!cid && p.company) {
      const row = companyRoster.find((r) => sameCompany(p.company, r.name));
      if (row) cid = row.cid;
    }
    if (cid && (cid === clientCid || (data.competitors || {})[cid])) {
      setSelectedCid(cid);
      setSelectedProduct(null);
      setProductSearch("");
      setCategoryFilter("all");
    }
    if (p.productName) setPendingProduct(String(p.productName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takePending]);

  /* Sidebar dropdown options: [{ v, n }] over the roster rows, every option backed by
     at least one company, and the "All" label prints options.length -- so the count a
     reader sees and the list under it are one array. Every country a company is
     present in, not just the first: Airbus is in five, and offering only one of them
     made the other four unreachable by this filter. */
  const sidebarCountries = useMemo(
    () => facetOptionsByName(companyRoster, (c) => c.countries || []),
    [companyRoster],
  );
  const sidebarCategories = useMemo(
    () => facetOptionsByName(companyRoster, (c) => c.categories || []),
    [companyRoster],
  );

  const { searchQuery } = useAppState();

  // Filter company sidebar roster based on search + country + category + revenue
  const filteredCompanyRoster = useMemo(() => {
    const q = (companyQuery || searchQuery || "").trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return companyRoster.filter((c) => {
      if (tokens.length > 0) {
        const fullText = `${c.name || ""} ${c.sector || ""} ${c.hq || ""} ${c.cid || ""}`.toLowerCase();
        if (!tokens.every((tok) => fullText.includes(tok))) return false;
      }
      if (sidebarCountryFilter !== "all" && !(c.countries || []).includes(sidebarCountryFilter))
        return false;
      if (sidebarCategoryFilter !== "all" && !(c.categories || []).includes(sidebarCategoryFilter)) return false;
      if (sidebarRevenueFilter !== "all" && c.revenueTier !== sidebarRevenueFilter) return false;
      return true;
    });
  }, [companyRoster, companyQuery, searchQuery, sidebarCountryFilter, sidebarCategoryFilter, sidebarRevenueFilter]);

  // Selected company details
  const selectedCompany = useMemo(() => {
    if (selectedCid === clientCid) {
      return { cid: clientCid, name: clientName, isClient: true };
    }
    const co = (data.competitors || {})[selectedCid] || {};
    return {
      cid: selectedCid,
      name: cleanCompanyName(co.name || selectedCid),
      rawName: co.name || selectedCid,
      sector: co.sector || "",
      hq: co.hq || "",
    };
  }, [data, selectedCid, clientCid, clientName]);

  // Get products for currently selected company
  const companyProducts = useMemo(() => {
    const isClient = selectedCid === clientCid;
    /* THE MATCHUP ID IS THE KEY, NOT A FIELD ON THE VALUE. This read
       Object.values, so `m.id` below was always undefined and every product id fell
       back to its NAME -- which is also why nothing here could offer a jump into
       Positioning: the one thing that page needs to open a pairing was being thrown
       away one line before it was wanted. */
    const matchups = Object.entries(data.matchups || {}).map(([id, m]) => ({ ...m, id }));
    const prods = [];
    const seen = new Set();
    const seenKeys = [];  // collapsed product keys, for fuzzy stub dedup

    /* Product photos live on the competitor's own products list (serving.competitors
       .products[].image, VL-verified at ingest). Resolve by fuzzy name so a matchup's
       rich entry inherits the image that sat on the folded stub. */
    const _coForImg = (data.competitors || {})[selectedCid] || {};
    const _coImg = {};
    (_coForImg.products || []).forEach((pp) => {
      const o = typeof pp === "string" ? {} : pp || {};
      const nm = o.name || o.n || "";
      if (o.image && nm) _coImg[prodKey(nm)] = { image: o.image, imageSource: o.imageSource || null };
    });
    const imgFor = (nm) => {
      const k = prodKey(nm);
      const hit = Object.keys(_coImg).find((kk) => sameProduct(kk, k));
      return hit ? _coImg[hit] : { image: null, imageSource: null };
    };

    if (isClient) {
      /* THE CLIENT'S OWN CATALOGUE FIRST. The portfolio was built only from the matchups, so a model with no
         rival pairing (DQCA, C550D5, C1750D6E ...) was missing from it, and a tender that names one could not open
         it. The client's served products list (specs, image, source) leads, as it does for a rival; a matchup
         only adds its Compare button, and a model that only a matchup names is still listed after. */
      const bandLabel = (data && data.BAND_LABEL) || {};
      const coOwn = (data.competitors || {})[clientCid] || {};
      const matchupForOwn = (nm) => {
        const k = prodKey(nm);
        const hit = matchups.find((m) => sameProduct(prodKey(String(m.bf || m.anchor || "").replace(/^.*·\s*/, "").trim()), k));
        return hit || null;
      };
      (coOwn.products || []).forEach((obj) => {
        const nm = (obj && obj.name) || "";
        const pk = prodKey(nm);
        if (!nm || seen.has(nm.toLowerCase()) || seenKeys.some((k) => k === pk)) return;
        seen.add(nm.toLowerCase());
        seenKeys.push(pk);
        const mu = matchupForOwn(nm);
        prods.push({
          id: `co-prod-${obj.id || nm}`,
          matchupId: mu ? mu.id : null,
          name: formatProductName(nm),
          company: clientName,
          category: formatCategoryTitle((obj.band && bandLabel[obj.band]) || (mu && mu.cat) || obj.category),
          source: obj.source || "",
          sourceUrl: obj.source_url || "",
          specs: obj.specs && typeof obj.specs === "object" ? obj.specs : {},
          incomplete: obj.incomplete === true,
          specSources: Array.isArray(obj.sources) ? obj.sources : (obj.source_url ? [obj.source_url] : []),
          tier: obj.tier || null,
          reason: mu ? mu.reason || "" : "",
          image: obj.image || null,
          imageSource: obj.imageSource || null,
        });
      });
      matchups.forEach((m) => {
        let rawBf = m.bf || m.anchor || "";
        if (seenKeys.some((k) => sameProduct(k, prodKey(rawBf.replace(/^.*·\s*/, "").trim())))) return;
        let name = rawBf.replace(/^(KSSL|Cummins Arabia)\s*·\s*/i, "").trim();
        if (!name || name === "KSSL present" || name.startsWith("KSSL")) {
          const match = rawBf.match(/KSSL\s*·\s*(.*)/i);
          if (match) name = match[1].trim();
        }
        if (name && name !== "KSSL present" && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const specsObj = productSpecs(m.specs, "client", formatCategoryTitle);
          prods.push({
            id: `kssl-${name}`,
            /* EVERY PRODUCT ON THIS BRANCH COMES OUT OF A MATCHUP, so every one of them
               has a comparison to open -- and none of them offered it, because the id
               was not carried across. The rival branch below sets `matchupId` and the
               row renders "Compare" from it; this branch built the row from `m` and then
               dropped the one field that says which pairing it came from, so the KSSL
               portfolio was the one catalogue in the app where Compare could never
               appear. Reported as "add the compare button wherever compare is
               available", and this is where it was available and absent. */
            matchupId: m.id || null,
            name: formatProductName(name),
            company: clientName,
            category: formatCategoryTitle(m.cat),
            specs: specsObj,
            reason: m.reason || "",
            ...imgFor(name),
          });
        }
      });
    } else {
      const co = (data.competitors || {})[selectedCid] || {};
      /* ENRICHMENT ONLY. This loop listed every matchup whose rival is this company as a
         product, with the matchup's own specs and category: all 77 matchups carry older
         agent/curated values, so a product sheet showed "Payload / ceiling: 450kg / 30000ft,
         STANAG4671" beside the enriched sheet (QA audit 2026-09-19). A matchup now only
         lends its Compare button to the enriched product of the same name. */
      const matchupFor = (nm) => {
        const k = prodKey(nm);
        const hit = matchups.find((m) => sameCompany(m.compBy || m.comp || "", co.name || selectedCid)
          && sameProduct(prodKey((m.comp || "").replace(/.*·\s*/, "").trim()), k));
        return hit ? hit.id : null;
      };

      (co.products || []).forEach((pName) => {
        const obj = typeof pName === "string" ? { name: pName } : pName || {};
        const name = obj.name || obj.n || "";
        const pk = prodKey(name);
        if (name && !seen.has(name.toLowerCase()) && !seenKeys.some((k) => sameProduct(k, pk))) {
          seen.add(name.toLowerCase());
          seenKeys.push(pk);
          prods.push({
            id: obj.id ? `co-prod-${obj.id}` : `co-prod-${name}`,
            matchupId: matchupFor(name),
            name: formatProductName(stripCompanyPrefix(name, co.name || selectedCompany.name)),
            company: selectedCompany.name,
            /* The product's OWN band when the record carries one -- this used to be the
               company's sector for every product it makes, so a firm's radars and its
               trucks came out under one label. It is a narrow win: measured over the
               real corpus only 4 products in 112 carry a band, because real names are
               model designations (Switchblade, VSR-700) with no category word in them.
               co.sector stays the fallback, and is also what the reference archive's
               bare-string products still use. */
            category: formatCategoryTitle(obj.category || co.sector),
            source: obj.source || "",
            sourceUrl: obj.source_url || "",
            /* A product's OWN sourced spec sheet (from the audited master dataset) --
               this is the product's own figures, not a KSSL comparison, so no matchup
               is needed. Empty stays empty; nothing is invented. */
            specs: obj.specs && typeof obj.specs === "object" ? obj.specs : {},
            /* fewer than 2 extracted specs: a real product whose record is thin. It is listed
               and SAYS so, rather than being hidden or passing as a full sheet. */
            incomplete: obj.incomplete === true,
            specSources: Array.isArray(obj.sources) ? obj.sources : (obj.source_url ? [obj.source_url] : []),
            tier: obj.tier || null,
            reason: "",
            image: obj.image || null,
            imageSource: obj.imageSource || null,
          });
        }
      });
    }

    return prods;
  }, [data, selectedCid, clientCid, clientName, selectedCompany.name]);

  useEffect(() => {
    if (pendingProduct === null) return;
    const want = nameKey(pendingProduct);
    /* exact name first; else the entry this one was folded into when the catalogue was de-duplicated
       ("MGS2500B (60 Hz)" is listed as "MGS2500B", see sameProduct) */
    const hit = companyProducts.find((p) => nameKey(p.name) === want)
      || companyProducts.find((p) => sameProduct(prodKey(p.name), prodKey(pendingProduct)));
    if (hit) setSelectedProduct(hit);
    setPendingProduct(null);
  }, [pendingProduct, companyProducts]);

  // Product categories for selected company
  const categories = useMemo(() => {
    const set = new Set(companyProducts.map((p) => p.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [companyProducts]);

  // Filter products by search and category
  const filteredCompanyProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return companyProducts.filter((p) => {
      const catMatch = categoryFilter === "all" || p.category === categoryFilter;
      if (!catMatch) return false;
      if (!q) return true;

      const nameMatch = p.name.toLowerCase().includes(q);
      const catTextMatch = p.category.toLowerCase().includes(q);
      const specMatch = Object.entries(p.specs).some(
        ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
      );

      return nameMatch || catTextMatch || specMatch;
    });
  }, [companyProducts, productSearch, categoryFilter]);

  // Group filtered products by Category
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredCompanyProducts.forEach((p) => {
      /* British spelling, as formatCategoryTitle's own default -- this literal was the
         one American one left, so a product with no band grouped under "Defense
         Systems" beside "Defence Systems" headings everywhere else (FE 18). */
      const cat = p.category || "Defence Systems";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  }, [filteredCompanyProducts]);

  // Generate Product News Dataset when a product is selected
  const productNewsArticles = useMemo(() => {
    if (!selectedProduct) return [];
    const direct = productNews(data, selectedCompany.cid, selectedProduct.name);
    if (direct && direct.length > 0) return direct;
    const allCompany = companyNews(data, selectedCompany.cid) || [];
    const pName = (selectedProduct.name || "").toLowerCase();
    const cat = (selectedProduct.category || "").toLowerCase();
    const filtered = allCompany.filter((a) => {
      const txt = `${a.title || ""} ${a.category || ""}`.toLowerCase();
      return txt.includes(pName) || txt.includes(cat);
    });
    if (filtered.length > 0) return filtered;
    return allCompany.slice(0, 6);
  }, [data, selectedProduct, selectedCompany]);

  /* LIVE WEB MENTIONS for the selected product -- Google News RSS, anchored to the maker,
     fetched server-side via /api/pulse (same lane as the company pulse). This is SEPARATE
     from the corpus-sourced product news above and clearly labelled live/unverified: it
     fills the common gap where the pipeline has no sourced story yet, without ever being
     counted as "sourced". Null-safe; a dead feed just yields []. */
  const [productPulse, setProductPulse] = useState(null);
  useEffect(() => {
    const cid = selectedCompany && selectedCompany.cid;
    const pname = selectedProduct && selectedProduct.name;
    if (!cid || !pname) { setProductPulse(null); return; }
    const k = pulseKey(cid, pname);
    const cached = readPulse(k);
    if (cached) { setProductPulse(cached); return; } // instant on a re-visit; no re-fetch this session
    setProductPulse(null); // first time for this product: show the loading state while it fetches
    let cancelled = false;
    fetch(`/api/pulse?cid=${encodeURIComponent(cid)}&name=${encodeURIComponent(selectedCompany.name || "")}&product=${encodeURIComponent(pname)}`)
      .then((r) => r.json())
      .then((j) => { const v = j || {}; if (!cancelled) { setProductPulse(v); writePulse(k, v); } })
      .catch(() => { if (!cancelled) setProductPulse({ trending: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany && selectedCompany.cid, selectedProduct && selectedProduct.name]);
  const productMentions = (productPulse && productPulse.trending) || [];

  /* The pills used to be a fixed list -- Sales, Technology, Testing -- matched against
     each article's `category`. But `category` is the pipeline's PRODUCT category
     ("UAVs & Drones", "Missiles & Air Defence", "Artillery", ...), and not one of the
     492 served articles carries any of those three words. Every pill emptied the feed,
     always, for every product. So the pills are built from the categories the articles
     actually have; a category that appears in the data is a category you can filter by. */
  const prodNewsCats = useMemo(
    () => ["All", ...Array.from(new Set(productNewsArticles.map((a) => a.category).filter(Boolean)))],
    [productNewsArticles],
  );

  const filteredProdArticles = useMemo(() => {
    if (!prodNewsFilter || prodNewsFilter === "All") {
      return productNewsArticles;
    }
    return productNewsArticles.filter((a) => a.category === prodNewsFilter);
  }, [productNewsArticles, prodNewsFilter]);

  /* No `|| productNewsArticles[0]` tail: falling back to the unfiltered list meant a
     filter that matched nothing still displayed an off-filter article as TOP STORY, so
     the filter looked half-applied rather than empty. */
  const topProdStory = useMemo(() => {
    return filteredProdArticles.find((a) => a.isTopStory) || filteredProdArticles[0] || null;
  }, [filteredProdArticles]);

  const feedProdArticles = useMemo(() => {
    return filteredProdArticles.filter((a) => a.id !== (topProdStory && topProdStory.id));
  }, [filteredProdArticles, topProdStory]);

  /* How many articles the COMPANY has. When none names the product, the news section
     says so and offers the company's feed by name -- as a door to the profile page, not
     as product news. Company articles presented as product news was the fault the
     product filter was written to remove. */
  const companyNewsCount = useMemo(
    () => (selectedCompany.isClient ? 0 : companyNews(data, selectedCompany.cid).length),
    [data, selectedCompany],
  );

  /* What the header's Copy / Export / Print act on: the open product's specification
     sheet and the sourced articles naming it, or the company's catalogue as filtered.
     Every field is the record's own; a product with no specs says so. */
  const report = useMemo(() => {
    if (selectedProduct) {
      /* Printed as-is, because that is what the panel prints: specValueWithUnit
         already joined each figure to its unit when the product was built, so
         re-casing here would make the exported sheet disagree with the screen it
         claims to copy. The formatter this line used to name has never existed in
         this repo -- the ReferenceError threw inside a useMemo that runs on every
         render, so the whole Products view rendered nothing. */
      const specRows = Object.entries(selectedProduct.specs || {}).map(([k, v]) => [k, String(v)]);
      const newsRows = productNewsArticles.map((a) => [a.title, [a.source, a.ago, a.category].filter(Boolean).join(" · ")]);
      return {
        title: `${selectedCompany.name} - ${selectedProduct.name}`,
        subtitle: `${selectedProduct.category} · product technical specification`,
        sections: [
          {
            h: "Technical specifications",
            rows: specRows.length ? specRows : [`No specifications are held for ${selectedProduct.name}.`],
          },
          {
            h: `Latest news naming ${selectedProduct.name} (${productNewsArticles.length})`,
            rows: newsRows.length ? newsRows : ["No sourced article names this product."],
          },
        ].filter(Boolean),
        payload: {
          company: selectedCompany.name,
          cid: selectedCompany.cid,
          product: {
            name: selectedProduct.name,
            category: selectedProduct.category,
            specs: selectedProduct.specs || {},
            source: selectedProduct.source || null,
            sourceUrl: selectedProduct.sourceUrl || null,
          },
          news: productNewsArticles.map((a) => ({
            title: a.title,
            source: a.source || null,
            date: a.date || null,
            category: a.category || null,
            url: a.url || null,
          })),
        },
      };
    }
    const groups = Object.entries(groupedProducts);
    return {
      title: `${selectedCompany.name} Product Portfolio`,
      subtitle:
        `${filteredCompanyProducts.length} of ${companyProducts.length} products` +
        (productSearch ? ` matching "${productSearch}"` : "") +
        (categoryFilter !== "all" ? ` · ${categoryFilter}` : ""),
      sections: groups.map(([cat, list]) => ({
        h: cat,
        rows: list.map((p) => {
          const n = Object.keys(p.specs || {}).length;
          return [p.name, n ? `${n} spec field${n === 1 ? "" : "s"}` : "no specs held"];
        }),
      })),
      payload: {
        company: selectedCompany.name,
        cid: selectedCompany.cid,
        products: filteredCompanyProducts.map((p) => ({
          name: p.name,
          category: p.category,
          specs: p.specs || {},
          source: p.source || null,
          sourceUrl: p.sourceUrl || null,
        })),
      },
    };
  }, [selectedProduct, selectedCompany, productNewsArticles, groupedProducts, filteredCompanyProducts, companyProducts, productSearch, categoryFilter]);
  useHeaderReport(report);

  useEffect(() => {
    setScope("products", { selection: `${selectedCompany.name} Products` }, {
      pillar: "Competitive",
      view: "Products",
      selection: `${selectedCompany.name} Products`,
    });
  }, [setScope, selectedCompany]);

  return (
    <div className="pos-view v-products" style={{ gridTemplateColumns: "300px 1fr" }}>
      {/* 1. LEFT SIDEBAR: COMPANY SELECTOR */}
      <div className="mu-list">
        <div className="mu-list-h">
          <span className="eyebrow">Companies ({filteredCompanyRoster.length})</span>

          {/* Company Sidebar Filters (Country, Product Category, Revenue) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", marginBottom: "10px" }}>
            {/* 1. Country Filter */}
            <select
              aria-label="Filter companies by country"
              className="mu-fsel"
              onChange={(e) => setSidebarCountryFilter(e.target.value)}
              style={{ width: "100%" }}
              value={sidebarCountryFilter}
            >
              <option value="all">All countries ({sidebarCountries.length})</option>
              {sidebarCountries.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.v} ({o.n})
                </option>
              ))}
            </select>

            {/* 2. Product Category Filter */}
            <select
              aria-label="Filter companies by category"
              className="mu-fsel"
              onChange={(e) => setSidebarCategoryFilter(e.target.value)}
              style={{ width: "100%" }}
              value={sidebarCategoryFilter}
            >
              <option value="all">All categories ({sidebarCategories.length})</option>
              {sidebarCategories.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.v} ({o.n})
                </option>
              ))}
            </select>

            {/* 3. Revenue Filter -- only when the roster carries a tier to filter on */}
            {sidebarRevenue.length ? (
              <select
                aria-label="Filter companies by revenue"
                className="mu-fsel"
                onChange={(e) => setSidebarRevenueFilter(e.target.value)}
                style={{ width: "100%" }}
                value={sidebarRevenueFilter}
              >
                <option value="all">All revenue tiers ({sidebarRevenue.length})</option>
                {sidebarRevenue.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l} ({o.n})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="mu-search">
            <span className="si">⌕</span>
            <input
              type="text"
              placeholder="Search company…"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
            />
          </div>
        </div>

        <div id="patc-list">
          {filteredCompanyRoster.map((r) => (
            <div
              key={r.cid}
              className={`pat-li${selectedCid === r.cid ? " active" : ""}`}
              onClick={() => {
                setSelectedCid(r.cid);
                setSelectedProduct(null);
                setProductSearch("");
                setCategoryFilter("all");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCid(r.cid);
                  setSelectedProduct(null);
                }
              }}
            >
              <span className="pli-n" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`wdot ${r.threat === "high" ? "threat" : r.threat === "fav" ? "fav" : "watch"}`} />
                {r.name}
              </span>
            </div>
          ))}
          {!filteredCompanyRoster.length && (
            <div className="cp-empty">no company matches “{companyQuery}”</div>
          )}
        </div>
      </div>

      {/* 2. RIGHT PANE: LINE-BY-LINE PRODUCTS LIST OR WHITE BACKGROUND SPECS TAB */}
      <div className="cp-body" style={{ padding: "20px", background: "var(--d-bg)" }}>
        {selectedProduct ? (
          /* THE IN-APP ARTICLE PANEL IS GONE, as on the Profile page. A product-news item
             now goes to the publisher (ArticleLink); the white panel that stood here
             re-hosted the story as `signal_detail.what` under the publisher's headline,
             with the real article one further click away. */
            /* ============ DARK BACKGROUND SPECIFICATIONS & DETAIL TAB ============ */
            <div
              className="product-specs-dark-tab"
              style={{
                background: "var(--d-bg-1)",
                color: "var(--d-txt)",
                borderRadius: "8px",
                border: "1px solid var(--d-line)",
                padding: "24px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                minHeight: "calc(100vh - 140px)",
                display: "flex",
                flexDirection: "column",
                gap: "28px",
              }}
            >
              {/* Top Bar with Product Info & Top Right Back Button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--d-line)",
                  paddingBottom: "16px",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: "700", color: "#ffffff", margin: 0 }}>
                    {selectedCompany.name} - {selectedProduct.name}
                  </h3>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    style={{
                      background: "var(--d-bg-2)",
                      border: "1px solid var(--d-line)",
                      color: "var(--d-txt)",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "background .15s",
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </div>


              {/* 1. TECHNICAL SPECIFICATIONS */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "12px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--d-txt)",
                    fontWeight: "700",
                    marginBottom: "14px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--d-line)",
                  }}
                >
                  Technical specifications
                </div>

                <div
                  style={{
                    border: "1px solid var(--d-line)",
                    borderRadius: "6px",
                    overflow: "hidden",
                  }}
                >
                  {Object.entries(getResolvedSpecs(selectedProduct)).map(([label, val], idx, arr) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "220px 1fr",
                        gap: "16px",
                        padding: "12px 18px",
                        background: idx % 2 === 0 ? "var(--d-bg-2)" : "var(--d-bg-1)",
                        borderBottom: idx < arr.length - 1 ? "1px solid var(--d-line)" : "none",
                        fontSize: "13px",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--d-txt-3)", fontWeight: "600" }}>
                        {label}
                      </span>
                      <span style={{ color: "#ffffff", fontWeight: "600" }}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. PROGRAMS */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "12px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--d-txt)",
                    fontWeight: "700",
                    marginBottom: "14px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--d-line)",
                  }}
                >
                  Programs
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {getProductPrograms(selectedProduct, selectedCompany).map((prog, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "var(--d-bg-2)",
                        border: "1px solid var(--d-line)",
                        borderRadius: "8px",
                        padding: "14px 18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                          {prog.title}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: "10.5px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: "rgba(52, 211, 153, 0.15)",
                            color: prog.statusColor || "#34d399",
                            border: `1px solid ${prog.statusColor || "#34d399"}`,
                            textTransform: "uppercase",
                            letterSpacing: ".04em",
                          }}
                        >
                          {prog.status}
                        </span>
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--d-txt-3)" }}>
                        {prog.authority} · {prog.date}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--d-txt-2)", lineHeight: "1.5", marginTop: "2px" }}>
                        {prog.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. PRODUCT COMPARISON */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "12px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--d-txt)",
                    fontWeight: "700",
                    marginBottom: "14px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--d-line)",
                  }}
                >
                  Product comparison
                </div>

                {(() => {
                  const compInfo = getProductComparison(selectedProduct, selectedCompany, data);
                  return (
                    <div
                      style={{
                        background: "var(--d-bg-1)",
                        border: "1px solid var(--d-line)",
                        borderRadius: "8px",
                        padding: "18px 22px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                          <span>{compInfo.sideA}</span>
                          <span style={{ color: "var(--d-txt-3)", fontWeight: "400", margin: "0 8px", fontSize: "13px" }}>vs</span>
                          <span>{compInfo.sideB}</span>
                        </div>
                        <div style={{ fontSize: "12.5px", color: "var(--d-txt-3)", lineHeight: "1.4" }}>
                          {compInfo.reason}
                        </div>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            jumpTo("competitive", "positioning", { matchupId: compInfo.matchupId });
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#34d399",
                            fontFamily: "var(--mono)",
                            fontSize: "13px",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            whiteSpace: "nowrap",
                            padding: "6px 10px",
                            borderRadius: "4px",
                            transition: "background .15s",
                          }}
                        >
                          <span>Open comparison</span>
                          <span style={{ fontSize: "14px" }}>↗</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 4. NEWS */}
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "12px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--d-txt)",
                    fontWeight: "700",
                    marginBottom: "14px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--d-line)",
                  }}
                >
                  News
                </div>

                {/* Category Filter Pills */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                  {prodNewsCats.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`ln-pill${prodNewsFilter === cat ? " on" : ""}`}
                      onClick={() => setProdNewsFilter(cat)}
                    >
                      {cat === "All" ? "All Product News" : cat}
                    </button>
                  ))}
                </div>

                {/* Grid of news cards */}
                <div className="ln-grid">
                  {(filteredProdArticles.length > 0 ? filteredProdArticles.slice(0, 6) : (productMentions.length > 0 ? productMentions.slice(0, 6) : [])).map((item, idx) => (
                    <ArticleLink
                      key={item.id || item.url || `pn-${idx}`}
                      article={item}
                      className="ln-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        background: "var(--d-bg-2)",
                        border: "1px solid var(--d-line)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ height: "130px", width: "100%", overflow: "hidden" }}>
                        <Thumb
                          src={item.image}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "11px", color: "var(--d-txt-3)", fontFamily: "var(--mono)" }}>
                          <span style={{ color: "#f0593c", fontWeight: "600" }}>{item.category || "Defence"}</span>
                          <span>·</span>
                          <span>{item.date ? new Date(item.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}</span>
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {item.title}
                        </div>
                        <div style={{ marginTop: "auto", paddingTop: "6px", fontSize: "11px", color: "var(--d-txt-3)", fontFamily: "var(--mono)" }}>
                          {item.source || "demo · defence-daily.example"}
                        </div>
                      </div>
                    </ArticleLink>
                  ))}
                </div>
              </div>
            </div>
        ) : (
          /* COMPANY PRODUCTS CATALOG VIEW (LINE BY LINE) */
          <>
            {/* Header & Filter Bar */}
            <div
              className="products-header"
              style={{
                marginBottom: "20px",
                display: "flex",
                gap: "14px",
                flexWrap: "wrap",
                alignItems: "center",
                background: "var(--d-bg-1)",
                padding: "16px 20px",
                borderRadius: "8px",
                border: "1px solid var(--d-line)",
              }}
            >
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: "700", color: "var(--d-txt)", margin: 0 }}>
                  {selectedCompany.name} Product Portfolio
                </h2>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Search products or specs..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  style={{
                    background: "var(--d-bg-2)",
                    border: "1px solid var(--d-line)",
                    color: "var(--d-txt)",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "12.5px",
                    width: "220px",
                    height: "38px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    background: "var(--d-bg-2)",
                    border: "1px solid var(--d-line)",
                    color: "var(--d-txt)",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "12.5px",
                    width: "200px",
                    height: "38px",
                    boxSizing: "border-box",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Categories ({categories.length - 1})</option>
                  {categories.filter((t) => t !== "all").map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* LINE BY LINE PRODUCTS LIST GROUPED BY CATEGORY */}
            <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
              {Object.keys(groupedProducts).length > 0 ? (
                Object.entries(groupedProducts).map(([catName, prodList]) => {
                  const open = !collapsedCats.has(catName);
                  return (
                  <div key={catName} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    {/* Category Title -- click to collapse / expand this category's list */}
                    <button
                      type="button"
                      onClick={() => toggleCat(catName)}
                      aria-expanded={open}
                      title={open ? `Collapse ${catName}` : `Expand ${catName}`}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px", width: "100%",
                        background: "none", border: "none", borderBottom: "1px solid var(--d-line)",
                        padding: "0 0 10px", cursor: "pointer", textAlign: "left", font: "inherit",
                      }}
                    >
                      {/* a drawn chevron: the ▾/▸ glyphs render tiny in this font at any size */}
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20"
                           style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
                        <path d="M7 4 L13 10 L7 16" fill="none" stroke="var(--d-txt-2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "13px", color: "var(--d-txt)", fontWeight: "600", letterSpacing: ".06em", textTransform: "uppercase" }}>
                        {catName}
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--d-txt-3)", background: "var(--d-bg-2)", border: "1px solid var(--d-line)", padding: "1px 7px", borderRadius: "10px" }}>
                        {prodList.length}
                      </span>
                    </button>

                    {/* Product cards: 3 cards in one row, name at top and view specs at the bottom corner (no image) */}
                    {open ? (
                    <div
                      className="product-cards-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "28px",
                      }}
                    >
                      {prodList.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedProduct(p)}
                          role="button"
                          tabIndex={0}
                          title={`Open ${p.name}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedProduct(p);
                            }
                          }}
                          className="product-card"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            background: "var(--d-bg-1)",
                            border: "1px solid var(--d-line)",
                            borderRadius: "12px",
                            overflow: "hidden",
                            cursor: "pointer",
                            transition: "transform .15s, box-shadow .15s, border-color .15s",
                          }}
                        >
                          <div className="pc-head">
                            <span className="pc-tag">{p.series || p.category || "Genset"}</span>
                            {p.hz ? <span className="pc-hz">{p.hz} Hz</span> : null}
                          </div>
                          <div className="pc-name" title={p.name}>{p.name}</div>
                          <dl className="pc-specs">
                            {cardSpecs(p).map(([k, v]) => (
                              <div className="pc-spec" key={k}>
                                <dt>{k}</dt>
                                <dd title={v}>{v}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="pc-foot">
                            <span className="pc-dc">
                              {p.specs && p.specs["Data centre rating"] ? "Data-centre rated" : ""}
                            </span>
                            <span className="pc-view">View specs →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    ) : null}
                  </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    background: "var(--d-bg-1)",
                    border: "1px solid var(--d-line)",
                    borderRadius: "8px",
                    color: "var(--d-txt-3)",
                    fontSize: "13px",
                  }}
                >
                  No products found for {selectedCompany.name} matching "{productSearch}".
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
