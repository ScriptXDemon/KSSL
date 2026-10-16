/* Threat classifier (lib/threat.js): segment overlap, geography, alliance.
   Runs on load; asserts the four-part read moves dir/severity correctly. */
import { build } from "esbuild";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, rmSync } from "fs";

const out = join(tmpdir(), `threat_${Date.now()}.mjs`);
await build({ entryPoints: ["src/lib/threat.js"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { refineThreat } = await import("file://" + out.replace(/\\/g, "/"));
rmSync(out, { force: true });

const ctx = { ksslCats: new Set(["Artillery", "UAVs & Drones"]), partnerKeys: new Set(["boeing"]) };
const card = (o) => ({ dir: "threat", severity: "high", severityLabel: "high", severityRank: 0, lens: "Competitive", ...o });
let bad = 0;
const ck = (c, m) => { if (!c) { bad++; console.error("FAIL:", m); } else console.log("  ok  " + m); };

// 1 · WHAT — an ISR/EO subsystem tagged as a KSSL category is still watch-only
const spectro = refineThreat(card({ title: "Elbit secures $270m for SPECTRO ISR systems", tags: "UAVs & Drones",
  sec: [{ read: "multi-spectral electro-optic ISTAR payloads for airborne surveillance" }] }), ctx);
ck(spectro.dir === "watch" && spectro.severity === "low", "ISR/EO subsystem -> watch/low despite KSSL category tag");

// a real KSSL platform stays a threat
const arty = refineThreat(card({ title: "Rival wins domestic howitzer artillery order", sec: [] }), ctx);
ck(arty.dir === "threat", "artillery platform -> stays threat");

// 2 · WHERE — foreign export caps a high threat to medium
const exp = refineThreat(card({ title: "Hanwha wins Spanish K9 tracked artillery contract", sec: [] }), ctx);
ck(exp.dir === "threat" && exp.severity === "medium", "foreign-export artillery -> capped to medium");

// Indian MoD procurement raises an artillery threat to high
const ind = refineThreat(card({ severity: "medium", severityRank: 1, title: "Tata wins Indian Army artillery contract", sec: [] }), ctx);
ck(ind.dir === "threat" && ind.severity === "high", "Indian-Army artillery -> raised to high");

// 3 · WHO — KSSL's own partner is not a threat
const partner = refineThreat(card({ title: "Boeing unveils new missile", company: "Boeing", sec: [] }), ctx);
ck(partner.dir === "watch", "KSSL partner (Boeing) -> watch, not a threat");

// a plain foreign non-KSSL-segment item is untouched (no false downgrade needed, no escalation)
const soft = refineThreat(card({ dir: "watch", severity: "low", severityRank: 2, title: "Vendor ships C4I software suite", sec: [] }), ctx);
ck(soft.dir === "watch", "software item stays watch");

console.log(bad ? `\n${bad} failure(s)` : "\nok - threat classifier");
if (bad) process.exit(1);
