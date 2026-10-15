/* WHAT A PATENT IS ABOUT, IN ENGLISH, ON EVERY ROW.
 *
 * Requested as "each patent give description their itself". The obvious place for that is
 * `abstract`, and it is NULL on all 1,157 served rows -- the WIPO harvest
 * (fetch_patents_wipo.py) stores the bibliographic record and does not pull abstracts, so
 * `.pat-abs` has been rendering an empty div on every card since the tab was built.
 *
 * There is a description on every row already, though, and it is the one field a patent
 * office is contractually precise about: the IPC classification. Every one of the 1,157
 * rows carries at least one code, and the codes resolve to twelve subclasses. A subclass
 * title is a published definition of the technical field the office placed the filing in
 * -- not a summary of THIS invention, and this file is careful to say which of those two
 * it is offering.
 *
 * SO IT IS LABELLED AS CLASSIFICATION, NEVER AS AN ABSTRACT. The card prints
 * "Classified under F41H - armour, armoured vehicles, and means of attack or defence",
 * which is a true statement about the record. Printing it under an "Abstract" heading
 * would be this pipeline asserting it had read a document it has never fetched, which is
 * the one thing this dashboard is not allowed to do -- and would be indistinguishable, to
 * the reader, from a real abstract on the rows where one eventually arrives.
 *
 * WHERE THESE WORDS COME FROM. The WIPO International Patent Classification scheme's own
 * subclass titles, shortened to a readable clause and lower-cased. They are definitions
 * of a classification system, not claims about any company, so there is nothing here that
 * the corpus could contradict. A subclass this file does not carry prints nothing rather
 * than a guess from the letters.
 *
 * THIS IS NOT THE TITLE TRANSLATION. 13 Korean titles are still shown in Korean, because
 * `title_en` is empty on every served row: extraction/signals/patent_titles.py exists,
 * the column exists, patents.js already renders the English line above the office's own
 * words -- the pass has simply never been run against this database. That is a pipeline
 * run, not a render change, and nothing here stands in for it.
 */

/* IPC subclass -> the field it covers. Keys are the four-character subclass, which is
   what the first four characters of a full code ("F42B 15/01") give. */
const SUBCLASS = {
  F41A: "functional features common to small arms and ordnance, and their mountings",
  F41C: "small arms, such as pistols and rifles",
  F41F: "apparatus for launching projectiles or missiles: cannon, rocket and torpedo launchers",
  F41G: "weapon sights and aiming",
  F41H: "armour, armoured vehicles, and means of attack or defence including camouflage",
  F42B: "explosive charges, ammunition and projectiles",
  F42C: "ammunition fuzes, and their arming and safety means",
  C06B: "explosive and thermic compositions, and their manufacture",
  C06C: "detonating and priming devices, fuses and pyrophoric compositions",
  C06D: "smoke and mist generation, and gas generation for blasting or propulsion",
  B64U: "unmanned aerial vehicles and their equipment",
  F02K: "jet-propulsion plants",
};

export function ipcSubclass(code) {
  const c = String(code == null ? "" : code).trim().toUpperCase();
  /* "F42B 15/01" and "F42B15/01" both start with the subclass; anything shorter is not
     one, and a code whose fifth character is not a digit is not an IPC code at all. */
  const head = c.replace(/\s+/g, "").slice(0, 4);
  return /^[A-H][0-9]{2}[A-Z]$/.test(head) ? head : "";
}

export function ipcMeaning(code) {
  return SUBCLASS[ipcSubclass(code)] || "";
}

/* The one line a patent card prints. Built from the row's FIRST classified code, because
   that is the office's primary placement; the rest are already listed as chips beside it.
   Returns "" when the row carries no code this file knows, so the card draws nothing
   rather than a sentence with a hole in it. */
export function ipcDescription(ipcList) {
  const codes = Array.isArray(ipcList) ? ipcList : ipcList ? [ipcList] : [];
  for (let i = 0; i < codes.length; i += 1) {
    const meaning = ipcMeaning(codes[i]);
    if (meaning) return { subclass: ipcSubclass(codes[i]), meaning };
  }
  return null;
}

export const IPC_SUBCLASSES = Object.keys(SUBCLASS);

export default ipcDescription;
