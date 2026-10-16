/* "GLOBAL" IS NOT A COUNTRY.

   The served details of 54 market, technology and competitor signals carry the fact Country = "Global". It names no
   country, and a reader asking which country a signal relates to got nothing. Each of those signals is read here
   from its own article (title and the "what the article says" text) and given the country it is about, or, where the
   article is a worldwide or regional read with no one country, a Region row instead (never a Country row saying
   Global). Keyed by the signal's id in the 13 Oct 2026 refresh. A "Global" signal not listed here loses its Country
   row rather than keeping a wrong one. */
const US = "United States";
const C = (...countries) => ({ countries });
const R = (region) => ({ region });

export const SIGNAL_COUNTRY = {
  rfm8: C(US), rfm10: R("Worldwide"), rfm11: C("Democratic Republic of the Congo"), rfm14: C(US), rfm21: C(US), rfm22: C(US),
  rfm23: C(US), rfm24: R("Americas"), rfm25: R("Worldwide"), rfm27: R("Worldwide"), rfm31: R("Worldwide"), rfm32: C(US),
  rfm34: C("Thailand"), rfm38: C(US), rfm40: C("South Korea", US), rfm41: C(US), rfm42: R("Worldwide"), rfm44: C(US),
  rfm46: C("Japan"), rfm47: C("Malaysia"), rfm48: R("Worldwide"), rfm49: C("Australia"), rfm51: C("Thailand", "Malaysia", "Vietnam", "Australia"),
  rfm53: R("Asia-Pacific"), rfm54: C("Netherlands"), rfm56: C(US), rfm57: R("Worldwide"),
  rfti1: C(US), rfti2: C("India", "United Kingdom"), rfti3: C("Germany", US), rfti4: C("Kazakhstan"), rfti5: C(US), rfti6: C(US),
  rfti7: C(US), rfti8: C("Singapore"), rfti9: C("Italy"),
  rfcm1: C(US), rfcm2: C("United Kingdom", "India"), rfcm4: R("Worldwide"), rfcm5: C(US), rfcm6: R("Worldwide"), rfcm7: C("China", US),
  rfcm8: C(US), rfcm9: C(US), rfcm10: R("Worldwide"), rfcm11: R("Worldwide"), rfcm12: R("Worldwide"), rfcm13: C(US), rfcm14: C("France"),
  rfcm15: C(US), rfcm16: C("India"), cm1: C("China"), cm2: C("China"), cm15: C("United Kingdom"),
};

const isGlobal = (v) => /^(global|worldwide|international)$/i.test(String(v || "").trim());

/* [label, text] for one signal's Country/Region row, or null when there is nothing true to show. */
export function countryFact(card, value) {
  if (!isGlobal(value)) return value ? ["Country", value] : null;
  const hit = SIGNAL_COUNTRY[card];
  if (hit && hit.countries) return [hit.countries.length > 1 ? "Countries" : "Country", hit.countries.join(", ")];
  if (hit && hit.region) return ["Region", hit.region];
  return null;
}

/* In place: every detail whose Country fact is "Global" gets the signal's real country or a Region row. */
export function fixGlobalCountry(details) {
  Object.keys(details || {}).forEach((id) => {
    const facts = details[id] && details[id].facts;
    if (!Array.isArray(facts)) return;
    const at = facts.findIndex((f) => f && String(f[0]).trim().toLowerCase() === "country" && isGlobal(f[1]));
    if (at < 0) return;
    const hit = SIGNAL_COUNTRY[id];
    const next = facts.slice();
    if (hit && hit.countries) next[at] = [hit.countries.length > 1 ? "Countries" : "Country", hit.countries.join(", "), ...next[at].slice(2)];
    else if (hit && hit.region) next[at] = ["Region", hit.region, ...next[at].slice(2)];
    else next.splice(at, 1);
    details[id] = { ...details[id], facts: next };
  });
  return details;
}

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("signalCountry.js")) {
  const d = fixGlobalCountry({
    rfcm2: { facts: [["Category", "Product"], ["Country", "Global"], ["Entities", "Perkins"]] },
    rfm25: { facts: [["Country", "Global"]] },
    zzz: { facts: [["Country", "Global"], ["Source", "x"]] },
    ok: { facts: [["Country", "Kuwait"]] },
  });
  const ok = d.rfcm2.facts[1][0] === "Countries" && d.rfcm2.facts[1][1] === "United Kingdom, India" && d.rfm25.facts[0][0] === "Region" && d.zzz.facts.length === 1 && d.ok.facts[0][1] === "Kuwait";
  if (!ok) throw new Error("signalCountry self-check failed");
  console.log("ok");
}
