/* smartTitleCase: proper title case that LOWERS ordinary all-caps words, lowercases
 * minor words unless first, and PRESERVES listed acronyms, mixed-case designations,
 * and any token carrying a digit.
 *
 *     node test_smart_case.mjs
 *
 * There was no dedicated test for smartTitleCase (src/lib/profile.js). It sits on the
 * notice/headline title path, so a regression here mangles the most-read text on the
 * page -- "US Army" -> "Us Army", or "M109" -> "M109" losing its number. Every case
 * below is a rule the function's own comment promises to hold.
 */
import { smartTitleCase } from "./src/lib/profile.js";

let bad = 0;
const ck = (name, want, got) => {
  if (want === got) console.log("  %s ok", name.padEnd(58));
  else { console.log("  %s FAIL (want %j, got %j)", name.padEnd(58), want, got); bad++; }
};

// ---- 1. ordinary all-caps words are LOWERED to title case -----------------------
ck("all-caps ordinary word is title-cased", "Brand-Name", smartTitleCase("BRAND-NAME"));
ck("all-caps single word lowered", "Only", smartTitleCase("ONLY"));
ck("lowercase word is capitalized", "Hello World", smartTitleCase("hello world"));

// ---- 2. listed acronyms are PRESERVED -------------------------------------------
ck("acronym USA preserved", "USA", smartTitleCase("usa"));
ck("acronym UAV preserved", "UAV", smartTitleCase("uav"));
ck("acronym UK preserved mid-phrase", "The UK Fleet", smartTitleCase("the UK fleet"));
ck("acronym EU preserved", "EU", smartTitleCase("eu"));
ck("acronym UN preserved", "UN", smartTitleCase("un"));
ck("K9 (digit token) preserved verbatim", "K9", smartTitleCase("K9"));
ck("acronym plural UAVs preserved (small trailing s)", "UAVs", smartTitleCase("UAVS"));

// ---- 3. the reported case: US Army must NOT be mangled ---------------------------
ck("US Army is not mangled", "US Army", smartTitleCase("US Army"));
ck("US Army from lower keeps US as acronym", "US Army", smartTitleCase("us army"));

// ---- 4. minor words go lower UNLESS first ----------------------------------------
ck("minor words lowered mid-title", "War of the Worlds", smartTitleCase("WAR OF THE WORLDS"));
ck("leading minor word IS capitalized", "Of Mice and Men", smartTitleCase("OF MICE AND MEN"));
ck("minor word 'for' lowered", "Systems for Defence", smartTitleCase("systems for defence"));
ck("minor word 'and' lowered", "Command and Control", smartTitleCase("command AND control"));

// ---- 5. mixed-case designations preserved verbatim -------------------------------
ck("sUAS preserved", "sUAS", smartTitleCase("sUAS"));
ck("BrahMos preserved", "BrahMos", smartTitleCase("BrahMos"));

// ---- 6. any token carrying a digit is preserved verbatim -------------------------
ck("M109 preserved", "M109", smartTitleCase("M109"));
ck("digit token in a phrase preserved verbatim", "The M109 Howitzer", smartTitleCase("the M109 howitzer"));
// NOTE: a digit token is preserved EXACTLY as given (case included); the function does
// not uppercase a lowercase designation. Real designations arrive uppercase, so this is
// fine in practice -- but "m109" stays "m109", it is not raised to "M109".
ck("lowercase digit token stays lowercase (documented, verbatim)", "m109", smartTitleCase("m109"));
// A hyphen splits, so a listed acronym on one side + digit on the other both survive.
ck("listed-acronym+digit designation (BMP-2) preserved", "BMP-2", smartTitleCase("bmp-2"));

// ---- 7. hyphens are word breaks, each side cased on its own -----------------------
ck("hyphenated ordinary words", "Brand-Name", smartTitleCase("brand-name"));
ck("hyphen with an acronym side", "C-UAS", smartTitleCase("c-uas"));

// ---- 8. leading/trailing punctuation attached to a token -------------------------
ck("trailing comma keeps acronym", "AI,", smartTitleCase("ai,"));
ck("parenthesized acronym", "(DSRV)", smartTitleCase("(dsrv)"));
ck("punctuation-wrapped ordinary word", "(Frigate)", smartTitleCase("(FRIGATE)"));

// ---- 9. empty / null / undefined input -------------------------------------------
ck("empty string", "", smartTitleCase(""));
ck("null input", "", smartTitleCase(null));
ck("undefined input", "", smartTitleCase(undefined));

// ---- 10. whitespace between words is preserved -----------------------------------
ck("multiple spaces preserved", "US  Army", smartTitleCase("US  Army"));

// ---- 11. hyphenated platform designations keep BOTH sides (BUG-1 regression) ------
ck("AH-64 designation", "AH-64 Spares", smartTitleCase("AH-64 spares"));
ck("CH-47 designation", "CH-47 Blades", smartTitleCase("CH-47 blades"));
ck("KC-46 designation", "KC-46 Boom", smartTitleCase("KC-46 boom"));
ck("YFQ-44A designation", "YFQ-44A Drone", smartTitleCase("YFQ-44A drone"));
ck("digit token stays verbatim mid-title", "155mm HE Shells", smartTitleCase("155mm HE shells"));

if (bad) { console.log(`\n${bad} failure(s)`); process.exit(1); }
console.log("\nok - smartTitleCase preserves acronyms/designations/digits, lowers all-caps and minor words, does not mangle US Army");
