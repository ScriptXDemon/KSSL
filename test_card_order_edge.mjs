/* Edge cases for compareCards (src/lib/overview.js), beyond test_card_order.mjs.
 *
 *     node test_card_order_edge.mjs
 *
 * The new rule set, pinned at its corners:
 *   - within a direction band, an UNGRADED card sinks below every graded card;
 *   - among graded cards DATE leads (newest first);
 *   - severity breaks a SAME-DATE tie, using the SERVED rank (never re-derived);
 *   - an undated card sorts to the bottom of its band;
 *   - direction (threat > watch > fav) leads everything, incl. an unknown dir.
 */
import { compareCards, SEVERITY_UNASSESSED_RANK } from "./src/lib/overview.js";

const HIGH = 0, MED = 1, LOW = 2, NONE = SEVERITY_UNASSESSED_RANK;
const data = { details: {} };
const card = (id, over = {}) => ({ id, dir: "threat", sec: [1], ...over });
const order = (list) => list.slice().sort(compareCards(data)).map((c) => c.id).join(",");

let bad = 0;
const ck = (name, want, got) => {
  if (want === got) console.log("  %s ok", name.padEnd(56));
  else { console.log("  %s FAIL\n      want %s\n      got  %s", name.padEnd(56), want, got); bad++; }
};

// ---- 1. mixed graded/ungraded within one band: all graded lead, ungraded trail --
// among the ungraded, date still orders them (both are ungraded so the ungraded key ties)
ck("graded (any date) lead ungraded; ungraded then by date",
   "g-old,u-new,u-old",
   order([
     card("u-new", { severityRank: NONE, ago: "9 Sep 2026" }),
     card("g-old", { severityRank: LOW, ago: "1 Jan 2020" }),
     card("u-old", { severityRank: NONE, ago: "1 Jan 2019" }),
   ]));

// ---- 2. same-date tie across three severities: severity ascends (high first) ----
ck("same-date tie ordered high<med<low by served rank",
   "hi,md,lo",
   order([
     card("lo", { severityRank: LOW, ago: "5 Sep 2026" }),
     card("md", { severityRank: MED, ago: "5 Sep 2026" }),
     card("hi", { severityRank: HIGH, ago: "5 Sep 2026" }),
   ]));

// ---- 3. date beats severity across DIFFERENT dates -------------------------------
// a low-severity newer card outranks a high-severity older one (date leads)
ck("newer low outranks older high (date leads within band)",
   "low-new,high-old",
   order([
     card("high-old", { severityRank: HIGH, ago: "1 Aug 2026" }),
     card("low-new", { severityRank: LOW, ago: "2 Aug 2026" }),
   ]));

// ---- 4. undated cards sink to the bottom of the band, below any dated card -------
ck("undated graded card sorts below dated graded card",
   "dated,undated",
   order([
     card("undated", { severityRank: HIGH, ago: "" }),
     card("dated", { severityRank: LOW, ago: "1 Jan 2020" }),
   ]));

// ---- 5. direction precedence: threat > watch > fav, whatever the date/severity ---
ck("direction leads: threat, then watch, then fav",
   "t,w,f",
   order([
     card("f", { dir: "fav", severityRank: HIGH, ago: "9 Sep 2026" }),
     card("w", { dir: "watch", severityRank: HIGH, ago: "9 Sep 2026" }),
     card("t", { dir: "threat", severityRank: NONE, ago: "1 Jan 2019" }),
   ]));

// ---- 6. an unknown direction sorts AFTER the three known bands -------------------
ck("an unknown dir sorts last of all",
   "t,w,f,x",
   order([
     card("x", { dir: "mystery", severityRank: HIGH, ago: "9 Sep 2026" }),
     card("f", { dir: "fav", severityRank: HIGH, ago: "1 Jan 2019" }),
     card("t", { dir: "threat", severityRank: LOW, ago: "1 Jan 2019" }),
     card("w", { dir: "watch", severityRank: LOW, ago: "1 Jan 2019" }),
   ]));

// ---- 7. same date AND same severity: richer analysis (more sec) leads ------------
ck("final tiebreak: more sections leads on an otherwise exact tie",
   "rich,thin",
   order([
     card("thin", { severityRank: HIGH, ago: "5 Sep 2026", sec: [1] }),
     card("rich", { severityRank: HIGH, ago: "5 Sep 2026", sec: [1, 2, 3] }),
   ]));

// ---- 8. two ungraded cards in a band still order by date (newest first) ----------
ck("two ungraded cards order by date",
   "u-new,u-old",
   order([
     card("u-old", { severityRank: NONE, ago: "1 Jan 2020" }),
     card("u-new", { severityRank: NONE, ago: "1 Jan 2026" }),
   ]));

if (bad) { console.log(`\n${bad} failure(s)`); process.exit(1); }
console.log("\nok - direction leads, graded>ungraded, date leads within band, served severity breaks same-date ties");
