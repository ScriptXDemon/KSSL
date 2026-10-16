/* Stock tickers for the DIRECTLY-LISTED competitors only.
 *
 * Grounding rule: a ticker maps a competitor to the equity that IS that company —
 * never a conglomerate parent whose price is not the defence unit's. So Adani Defence
 * (Adani Enterprises), Mahindra Defence (M&M) and Tata Advanced Systems (Tata Sons)
 * are deliberately absent: showing the parent's price as "their stock" would be false.
 * Private firms (Anduril, SIG Sauer, KNDS, MBDA, Diehl, IWI, Roshel, Supacat) and
 * state arsenals (NORINCO, Munitions India, AWEIL, BrahMos, IAI, Rafael, Kalashnikov,
 * Patria, Nammo, HSW) have no listed equity and show "not publicly listed".
 *
 * Every symbol below was verified against the Yahoo Finance chart API to return a quote
 * whose company name matches the competitor (LSE prices are in GBp = pence).
 */
export const TICKERS = {
  aerovironment: "AVAV",
  babcock: "BAB.L",
  "bae-systems": "BA.L",
  "bharat-dynamics": "BDL.NS",
  "elbit-systems": "ESLT",
  "general-dynamics": "GD",
  "hanwha-aerospace": "012450.KS",
  kongsberg: "KOG.OL",
  l3harris: "LHX",
  "larsen-toubro": "LT.NS",
  "lockheed-martin": "LMT",
  "oshkosh-defense": "OSK",
  otokar: "OTKAR.IS",
  poongsan: "103140.KS",
  "premier-explosives": "PREMEXPLN.NS",
  raytheon: "RTX",
  rheinmetall: "RHM.DE",
  saab: "SAAB-B.ST",
  "solar-industries": "SOLARINDS.NS",
  iveco: "IVG.MI",
  // verified 2026-09-29 against the Yahoo chart API (company name matches)
  "bharat-electronics": "BEL.NS",
  "zen-technologies": "ZENTEC.NS",
  beml: "BEML.NS",
  "ashok-leyland": "ASHOKLEY.NS",
  "force-motors": "FORCEMOT.NS",
  walchandnagar: "WALCHANNAG.NS",
  nibe: "NIBE.BO",
  "adani-defence": "ADANIENT.NS",
  "mahindra-defence": "M&M.NS",
  "tata-advanced-systems": "TATAMOTORS.NS",
  "jindal-defence": "JINDALSTEL.NS",
  "jindal-defence-taurus": "JSL.NS",
  "brahmos-aerospace": "BRAHMOS.NS",
  "munitions-india": "MIL.NS",
  aweil: "AWEIL.NS",
  avnl: "AVNL.NS",
  "indo-russian-rifles": "IRRPL.NS",
  "jcbl-armouring": "JCBL.NS",
  "mku-limited": "MKU.NS",
  "raphe-mfr": "RAPHE.NS",
  smpp: "SMPP.NS",
  "sss-defence": "SSS.NS",
  "veda-defence": "VEDA.NS",
  "yantra-india": "YANTRA.NS",
};
/* The reference dataset (the local seed) keys companies by short codes -- LT, BEL, BDL --
   where the live roster uses slugs. Each code resolves to its slug, so one table serves
   both. Jindal Defence is deliberately absent: the only "Jindal" listing is Jindal Saw, a
   different company. */
export const ID_ALIAS = {
  LT: "larsen-toubro", BEL: "bharat-electronics", BDL: "bharat-dynamics", SOLAR: "solar-industries",
  PEL: "premier-explosives", ZEN: "zen-technologies", BEML: "beml", ASHOKLEY: "ashok-leyland",
  FORCE: "force-motors", WIL: "walchandnagar", NIBE: "nibe",
  ADANI: "adani-defence", MAHINDRA: "mahindra-defence", TASL: "tata-advanced-systems",
  MIL: "munitions-india", AWEIL: "aweil", BRAHMOS: "brahmos-aerospace", SSS: "sss-defence",
};
const canon = (cid) => (cid && ID_ALIAS[cid]) || cid;

// A short reason for the common not-listed cases, so the card says WHY rather than a
// bare "not listed". Anything not here falls back to the generic private/state line.
export const NOT_LISTED_NOTE = {
  "adani-defence": "part of Adani Enterprises — not separately listed",
  "mahindra-defence": "part of Mahindra & Mahindra — not separately listed",
  "tata-advanced-systems": "Tata Sons subsidiary — privately held",
  idv: "Iveco Defence Vehicles — a subsidiary, not separately listed",
  "israel-aerospace-industries": "Israeli state-owned",
  "rafael-advanced-defense-systems": "Israeli state-owned",
  norinco: "Chinese state-owned",
  "munitions-india": "Indian state-owned (ordnance)",
  aweil: "Indian state-owned (Advanced Weapons & Equipment India)",
  "brahmos-aerospace": "India–Russia state joint venture",
  kalashnikov: "Rostec (Russian state) group",
  knds: "privately held (KNDS N.V.)",
  mbda: "privately held (Airbus/BAE/Leonardo JV)",
  nexter: "part of KNDS — not separately listed",
  "naval-group": "French state-owned",
  patria: "Kongsberg + Finnish state owned",
  nammo: "Finnish/Norwegian state owned",
  anduril: "privately held",
  "sig-sauer": "privately held",
  "sss-defence": "privately held",
  iwi: "privately held (SK Group)",
  "diehl-defence": "privately held (Diehl Group)",
  roshel: "privately held",
  supacat: "privately held",
  "uvision-air": "privately held",
  "paramount-group": "privately held",
  "huta-stalowa-wola": "part of PGZ (Polish state) — not separately listed",
  "plr-systems": "privately held (IWI–Adani JV)",
};

export function tickerFor(cid) {
  return (cid && TICKERS[canon(cid)]) || null;
}

export function notListedNote(cid) {
  return (cid && NOT_LISTED_NOTE[canon(cid)]) || "privately or state held — not publicly listed";
}
