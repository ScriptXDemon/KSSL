/* Every patent says what it is about -- and says WHICH thing it is telling you.
 *
 * `abstract` is null on all 1,157 served rows: the WIPO harvest stores the bibliographic
 * record and never fetches abstracts, so `.pat-abs` rendered an empty div on every card
 * and the reader had a title and nothing else. The IPC classification IS on every row, so
 * the card prints the field the office placed the filing in.
 *
 * The risk is not coverage, it is CATEGORY: a classification is not an abstract, and a
 * reader must not be able to mistake one for the other. So what is asserted here is the
 * labelling as much as the lookup -- and that a real abstract, when one arrives, wins.
 */
import { ipcDescription, ipcMeaning, ipcSubclass, IPC_SUBCLASSES } from "./src/lib/ipc.js";
import { patRecCard } from "./src/lib/patents.js";

let fail = 0;
const ck = (name, ok, d) => {
  console.log(`  ${name.padEnd(64)} ${ok ? "PASS" : "FAIL"}${d !== undefined && !ok ? "  " + JSON.stringify(d) : ""}`);
  if (!ok) fail++;
};

/* ---- the code -> subclass reduction ---- */
ck("a full code reduces to its subclass", ipcSubclass("F42B 15/01") === "F42B");
ck("the space is optional", ipcSubclass("F42B15/01") === "F42B");
ck("case does not matter", ipcSubclass("f41h 5/00") === "F41H");
ck("a bare subclass is already one", ipcSubclass("B64U") === "B64U");
ck("something that is not a code reduces to nothing",
   ipcSubclass("junk") === "" && ipcSubclass("") === "" && ipcSubclass(null) === "");
ck("a near-miss shape is refused", ipcSubclass("FF42 15/01") === "", ipcSubclass("FF42 15/01"));

/* ---- the meanings ---- */
ck("all twelve subclasses in the served corpus are carried", IPC_SUBCLASSES.length === 12, IPC_SUBCLASSES.length);
ck("armour resolves", /armour/.test(ipcMeaning("F41H 5/00")));
ck("ammunition resolves", /ammunition/.test(ipcMeaning("F42B 15/01")));
ck("UAVs resolve", /unmanned aerial/.test(ipcMeaning("B64U 10/00")));
ck("an unknown subclass says nothing rather than guessing from the letters",
   ipcMeaning("Z99Z 1/00") === "", ipcMeaning("Z99Z 1/00"));

/* ---- the line ---- */
const d1 = ipcDescription(["F41G 7/00", "F42B 15/01"]);
ck("the row's FIRST classified code is the one described", d1.subclass === "F41G", d1);
ck("it carries both the code and the words", !!d1.subclass && !!d1.meaning);
const d2 = ipcDescription(["Z99Z 1/00", "F42B 15/01"]);
ck("an unknown leading code falls through to the next one it knows", d2.subclass === "F42B", d2);
ck("no codes at all is null, not an empty sentence",
   ipcDescription([]) === null && ipcDescription(null) === null && ipcDescription(undefined) === null);
ck("a bare string is accepted as one code", (ipcDescription("F41C 3/00") || {}).subclass === "F41C");

/* ---- the card: is it labelled as what it is? ---- */
const row = (o) => ({ id: "KR1020170079686", title: "유도 무기용 탐색 장치 및 이의 동작 방법",
                      assignee: "Hanwha Aerospace", status: "filed", filed: "2017-07-10",
                      jurisdiction: "KR", ipc: ["F42B 15/01"], abstract: null, ...o });
const meta = { relevDiscriminates: false };

const html = patRecCard(row(), true, meta);
ck("a card with no abstract prints the classification", /Classified under F42B/.test(html), html.slice(0, 200));
ck("...with the field in English", /explosive charges, ammunition/.test(html));
ck("...and NEVER calls it an abstract", !/>Abstract</i.test(html));
ck("...and says in its tooltip that no abstract was captured", /no abstract was captured/.test(html));
ck("...and marks the line as a classification for CSS to set apart", /pat-abs-ipc/.test(html));

const withAbs = patRecCard(row({ abstract: "A seeker for a guided weapon." }), true, meta);
ck("A REAL ABSTRACT WINS -- the classification steps aside", /A seeker for a guided weapon/.test(withAbs));
ck("...and the classification line is not also drawn", !/Classified under/.test(withAbs), withAbs.slice(0, 300));

const noIpc = patRecCard(row({ ipc: [] }), true, meta);
ck("no abstract and no code draws nothing at all, not an empty label",
   !/Classified under/.test(noIpc) && !/pat-abs/.test(noIpc));

/* ---- the part this does NOT do ---- */
ck("the Korean title is still the Korean title: this is not a translation",
   /유도 무기용/.test(html));

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
