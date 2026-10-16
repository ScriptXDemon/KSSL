/* THREAT CLASSIFICATION — is a competitor signal actually a threat to KSSL?
 *
 * The served `dir`/`severity` escalated on the coarse category `tags`: an Elbit
 * "SPECTRO ISR" contract is tagged "UAVs & Drones" (a KSSL category) and so was
 * flagged THREAT — even though ISR / electro-optic payloads are a subsystem KSSL does
 * not make. The dossier chat already said "not a threat"; the card contradicted it.
 *
 * This applies a deterministic four-part read (no model, no invented facts — it only
 * moves dir/severity, never adds a claim):
 *   1. WHAT  — segment overlap. A signal about a subsystem KSSL does not build
 *              (ISR/EO-IR/radar/sonar/software/seeker/optics/naval subsystems) with no
 *              KSSL platform in it is watch-only, whatever its category tag says.
 *   2. WHERE — geography. In a KSSL line, an Indian/MoD contract is a home-market
 *              threat (high); a foreign export win does not touch KSSL's protected
 *              domestic pipeline, so it is capped below "high".
 *   3. WHO   — alliances. If KSSL itself partners with the entity, its advance is
 *              co-produced, not a competitive threat.
 *   4. FINANCIAL (backlog) — long defence cycles mean a rival's win rarely cancels
 *              KSSL's standing multi-year backlog; nothing here auto-escalates on a
 *              breakthrough alone. (No per-card "KSSL was expected to win" signal is
 *              served, so this stays a de-escalation principle, not a raise.)
 */
import { partnerKey } from "./overlap.js";

// Subsystems / segments KSSL does NOT manufacture — a signal that is ONLY about these
// is not a product-level threat, even under a KSSL-sounding category tag.
const NON_KSSL =
  /\b(isr|istar|electro[- ]?optic|eo[/\\-]?ir|targeting (pod|payload|system)|payloads?|sensors?|radar|sonar|seekers?|avionics?|software|c4isr|c4i|c2 system|command[- ]and[- ]control|satellite|space|cyber|simulat|training (system|solution|apparatus)|optics?|lens(es)?|night[- ]vision|goggles?|thermal imag|data ?link|encryption|surveillance|reconnaissance|submarine|frigate|corvette|warship|naval vessel)/i;

// KSSL's own product platforms/lines — presence keeps a signal in scope.
const PLATFORM =
  /\b(artiller|howitzer|gun system|atags|towed gun|mounted gun|ammunition|\bammo\b|\bshell(s)?\b|propellant|cartridge|\bfuze\b|armou?r|armou?red|mrap|\bapc\b|\bifv\b|protected vehicle|\btank(s)?\b|tracked vehicle|mortar|rocket|mbrl|missile|air def|\buav(s)?\b|drone|loitering|forging|kavach|bulletproof|small arms|\brifle\b|shotgun|carbine)/i;

const INDIA =
  /\b(india|indian|\bmod\b|ministry of defence|make in india|atmanirbhar|drdo|indian army|indian navy|indian air force|bharat)\b/i;

const EXPORT =
  /\b(export|international customer|overseas|foreign (customer|buyer)|spanish|estonian|polish|egyptian|saudi|qatari|for the u\.?s\.? army|u\.?s\.? army|european|nato)\b/i;

const SEV = {
  high: { severity: "high", severityLabel: "high", severityRank: 0 },
  medium: { severity: "medium", severityLabel: "medium", severityRank: 1 },
  low: { severity: "low", severityLabel: "low", severityRank: 2 },
};

function blobOf(card) {
  /* Title + typed evidence ONLY. The category `tag` is exactly the unreliable signal
     we are overriding (Elbit's ISR payload is tagged "UAVs & Drones"), so feeding it
     back in as a platform keyword would defeat the segment test. */
  const ev = Array.isArray(card.sec) ? card.sec.map((s) => s && s.read) : [];
  return [card.title, ...ev].filter(Boolean).join(" ").toLowerCase();
}

export function refineThreat(card, ctx) {
  if (!card || card.lens === "Market") return card;
  const blob = blobOf(card);

  // 3 · WHO — KSSL's own partner: co-produced, not a threat
  const ck = partnerKey(card.company);
  if (ck && ctx.partnerKeys.has(ck)) {
    return {
      ...card,
      dir: "watch",
      ...SEV.low,
      threatWhy: `Cummins Arabia partners with ${card.company}; its advances are co-produced with Cummins Arabia, not a competitive threat.`,
    };
  }

  const hasNon = NON_KSSL.test(blob);
  const hasPlat = PLATFORM.test(blob);

  // 1 · WHAT — a subsystem/segment KSSL does not make, with no KSSL platform in it
  if (hasNon && !hasPlat) {
    return {
      ...card,
      dir: "watch",
      ...SEV.low,
      threatWhy:
        "Outside Cummins Arabia's product segments (ISR / electro-optics / radar / software / naval subsystems); Cummins Arabia does not build this, so it is watch-only.",
    };
  }

  // 2 · WHERE — only for signals in a KSSL product line
  if (hasPlat) {
    // Home-market: an explicit Indian MoD / armed-forces procurement in a KSSL line is
    // the severest kind. Only raises an existing threat -- never mints one from watch.
    if (INDIA.test(blob) && card.dir === "threat") {
      return {
        ...card,
        ...SEV.high,
        threatWhy: "An Indian / MoD procurement in a Cummins Arabia product line — a direct home-market threat.",
      };
    }
    // Foreign export in a KSSL line: real, but it does not touch KSSL's protected
    // domestic pipeline, so a top-tier "high" is capped to medium.
    if (EXPORT.test(blob) && !INDIA.test(blob) && card.dir === "threat" && card.severity === "high") {
      return {
        ...card,
        ...SEV.medium,
        threatWhy:
          "A foreign export win in a Cummins Arabia line — it does not touch Cummins Arabia's protected domestic pipeline, so it ranks below a home-market threat.",
      };
    }
  }
  return card;
}

export function refineThreats(d) {
  if (!d) return d;
  const ctx = {
    ksslCats: new Set(d.KSSL_CATS || []),
    partnerKeys: new Set((d.KSSL_PARTNERS || []).map((p) => partnerKey(p && p.label)).filter(Boolean)),
  };
  const lanes = ["competitiveCards"];
  lanes.forEach((lane) => {
    if (Array.isArray(d[lane])) d[lane] = d[lane].map((c) => refineThreat(c, ctx));
  });
  return d;
}
