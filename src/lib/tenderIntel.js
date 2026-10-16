/* Tender intelligence: the analyst's read of the ranked tenders, for the Tender
   Intelligence cockpit. Pure (no React, no window), so test_tender_intel.mjs pins it.

   Every figure is built from fields the tenders carry (db/tender_research.py,
   db/tender_fit.py): revenueMid (an ESTIMATE midpoint), cumminsFit, competitorFit,
   pursuit, dl / Closes, actions. The assumptions that turn value into a forecast are
   named constants below and are printed on the page beside the numbers they drive. */

export const ASSUME = {
  // chance Cummins Arabia books the genset share, by where the tender stands
  pWin: { live: 0.25, evaluation: 0.35, pursuit: 0.1 },
  // how much of the value a fit grade lets Cummins serve
  fitWeight: { strong: 1, partial: 0.5, poor: 0 },
  // decision -> genset purchase order: a direct supply/works tender orders soon after
  // award; a main contract / EPC / PPP buys its gensets a year or so after award
  orderLagDays: { direct: 90, main: 365 },
  // a pursuit with no bid date is assumed to decide this far out
  pursuitDecisionDays: 270,
  closingSoonDays: 21,
  // a Cummins set within 12 % of the rival's rating covers it (about one frame step);
  // a 2,188 kVA set against a 1,875 kVA rival is a 17 % oversize, i.e. a gap
  gapTolerance: 0.12,
};

const DAY = 86400000;
const MAIN_RX = /\b(EPC|design[- ]and[- ]build|design-build|main (contract|construction)|pre-?qualification|PPP|IPP|turnkey)\b/i;
const OEM_RX = /caterpillar|\bcat\b|zahid|al-?bahar|mtu|rolls-royce|rehlko|kohler|sdmo|mitsubishi|\bmhi\b|mhiet|weichai|baudouin|perkins|fg wilson|generac|volvo|cummins|aggreko|altaaqa|jubaili|kanoo power|w[aä]rtsil[aä]|siemens|\bge\b|general electric|jenbacher|innio|\babb\b|honeywell|john deere|deutz/i;
/* channels whose genset line is a rival brand: a route, but not a neutral one */
const TIED = [[/abunay+an/i, "Kohler"], [/galadari/i, "Baudouin"], [/al ?masaood/i, "mtu"], [/kanoo/i, "Perkins"]];

const mid = (t) => Number(t.revenueMid) || 0;
const fits = (t) => t.cumminsFit && t.cumminsFit !== "poor";
const reqVal = (t, k) => ((t.req || []).find((r) => r[0] === k) || [])[1];

/* THE TWO TABLES ON THE MARKET OVERVIEW, AND WHAT BELONGS IN EACH.

   TOP TENDERS: a buyer has issued a tender for the generator itself (supply, replacement, upgrade, rental, service)
   and it is still open for bids today. Not a tender that merely contains a genset inside a larger package: a metro
   prequalification, an air-base design-and-build, an EPC or an IPP RFP is bought by a main contractor later, so it
   is a project. Not a closed tender, awarded or award pending: that is not a chance to win, and an award nobody has
   re-checked may long since have been made.
   PROJECTS: the main contracts and pre-tender projects whose genset package is bought later.
   A tender that is neither (a facility-maintenance contract, a construction package with no genset in its title, a
   closed tender) stays on the Tenders page and is on neither table. */
const GENSET_RX = /generator|genset|generating set|back-?up (electrical )?power|standby (electrical )?(power|generators)|emergency d\.?g\b|\bDG\b/i;
const BUILD_RX = /\b(construction|public buildings)\b/i;
const direct = (t) => GENSET_RX.test(t.title || "") && !MAIN_RX.test(t.title || "") && !BUILD_RX.test(t.title || "");

export const PROJECT_MAX_AGE_DAYS = 365;

/* SOURCED AND CURRENT, OR NOT RANKED.
   A tender needs a checked status (db/tender_status.py: the portal or press was read and the result kept with its
   evidence): a row that rests on an aggregator mirror alone, with no status check, is not shown as a chance to win.
   A project needs dated evidence from the last PROJECT_MAX_AGE_DAYS: a project last reported a year ago is a lead
   nobody has re-read. Both rows stay on the Tenders page with the status they carry. */
export function isTender(t, today = new Date()) {
  if (!direct(t) || t.status === "upcoming" || t.pursuit) return false;
  if (t.rank && !t.statusChecked) return false;   // a served, ranked tender whose status nobody checked
  // OPEN FOR BIDS ONLY: a tender whose closing date has passed is not a chance to win, whether its award is pending
  // or long done. It stays on the Tenders page (Closed tab) and out of this table.
  if (t.status !== "open") return false;
  const closes = Date.parse(t.closingDate || reqVal(t, "Closes") || t.deadline || "");
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Number.isFinite(closes) ? closes >= midnight : !(Number(t.dl) <= 0);
}

const publishedOf = (t) => Date.parse(reqVal(t, "Published") || "");

export function isProject(t, today = new Date()) {
  if (!(direct(t) ? t.status === "upcoming" : !!t.pursuit || MAIN_RX.test(t.title || ""))) return false;
  const at = publishedOf(t);
  return !Number.isFinite(at) || today.getTime() - at <= PROJECT_MAX_AGE_DAYS * DAY;
}

export function kindOf(t) {
  return t.pursuit || MAIN_RX.test(t.title || "") ? "main" : "direct";
}

/* When the tender decides: its closing date, or (pursuit / no date) an assumed date. */
export function decisionOf(t, today) {
  const dl = Number(t.dl);
  if (t.status === "evaluation") return { date: new Date(today.getTime() + 45 * DAY), est: true };
  if (!t.pursuit && Number.isFinite(dl) && dl > 0 && dl < 9999)
    return { date: new Date(today.getTime() + dl * DAY), est: false };
  const closes = Date.parse(reqVal(t, "Closes") || "");
  if (!t.pursuit && Number.isFinite(closes) && closes > today.getTime()) return { date: new Date(closes), est: false };
  return { date: new Date(today.getTime() + ASSUME.pursuitDecisionDays * DAY), est: true };
}

export function stageOf(t) {
  return t.status === "evaluation" ? "evaluation" : t.pursuit ? "pursuit" : "live";
}

export function winWeighted(t) {
  return mid(t) * (ASSUME.fitWeight[t.cumminsFit] || 0) * ASSUME.pWin[stageOf(t)];
}

const quarter = (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;

/* rated kVA and frequency of a catalogue product, from its View Specs rows */
function rating(p) {
  const s = (p.specs && (p.specs["Standby rating"] || p.specs["Prime rating"])) || "";
  const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*kVA/i);
  return { kva: m ? Number(m[1]) : null, hz: Number(p.hz) || null };
}

export function tenderIntel(data, today = new Date()) {
  const all = (data.tenders || []).filter((t) => t.rank);
  const ok = all.filter(fits);
  const sum = (xs, f = mid) => xs.reduce((n, t) => n + f(t), 0);

  /* 1. headline + funnel */
  const closingSoon = ok.filter((t) => !t.pursuit && t.dl > 0 && t.dl <= ASSUME.closingSoonDays);
  const funnel = [
    { k: "Genset revenue in play", v: sum(all.filter((t) => t.cumminsFit !== "poor")), n: ok.length },
    { k: "Fits a Cummins model today", v: sum(all.filter((t) => t.cumminsFit === "strong")), n: all.filter((t) => t.cumminsFit === "strong").length },
    { k: "Win-weighted (stage × fit)", v: sum(ok, winWeighted), n: ok.length },
  ];

  /* 2. forecast of win-weighted genset orders by quarter */
  const byQ = new Map();
  ok.forEach((t) => {
    const d = decisionOf(t, today).date;
    const o = new Date(d.getTime() + ASSUME.orderLagDays[kindOf(t)] * DAY);
    const q = quarter(o);
    const row = byQ.get(q) || { q, v: 0, n: 0, sort: o.getUTCFullYear() * 4 + Math.floor(o.getUTCMonth() / 3) };
    row.v += winWeighted(t);
    row.n += 1;
    byQ.set(q, row);
  });
  const forecast = [...byQ.values()].sort((a, b) => a.sort - b.sort);

  /* 3. where to play */
  const group = (key) => {
    const m = new Map();
    ok.forEach((t) => m.set(t[key], (m.get(t[key]) || 0) + mid(t)));
    const tot = sum(ok) || 1;
    return [...m.entries()].map(([k, v]) => ({ k, v, share: v / tot })).sort((a, b) => b.v - a.v);
  };

  /* 4. who to beat: the best-fit rival per tender, and the most common head-to-head */
  const rivals = new Map();
  const pairs = new Map();
  ok.forEach((t) => {
    const c = (t.competitorFit || [])[0];
    if (!c || !c.company) return;
    const r = rivals.get(c.company) || { company: c.company, v: 0, n: 0, incumbent: 0 };
    r.v += mid(t);
    r.n += 1;
    r.incumbent += c.incumbent ? 1 : 0;
    rivals.set(c.company, r);
    const ours = ((t.matches || [])[0] || {}).n;
    const theirs = (c.products || [])[0];
    if (ours && theirs && !/job|fits/i.test(ours)) {
      const key = `${ours}||${theirs}`;
      const p = pairs.get(key) || { ours, theirs, company: c.company, v: 0, n: 0 };
      p.v += mid(t);
      p.n += 1;
      pairs.set(key, p);
    }
  });

  /* 5. product gap: the best-fit rival set sits in a size the client catalogue lacks */
  const clientId = (data.client && data.client.id) || "";
  const catalogue = Object.entries(data.competitors || {}).flatMap(([cid, co]) =>
    (co.products || []).map((p) => ({ own: cid === clientId, name: p.name, ...rating(p) })));
  const own = catalogue.filter((p) => p.own && p.kva);
  const gapTenders = [];
  ok.forEach((t) => {
    const c = (t.competitorFit || [])[0];
    const rp = c && catalogue.find((p) => !p.own && (c.products || []).includes(p.name));
    if (!rp || !rp.kva) return;
    const near = own.filter((p) => p.hz === rp.hz)
      .some((p) => Math.abs(p.kva - rp.kva) / rp.kva <= ASSUME.gapTolerance);
    if (!near) gapTenders.push({ t, rival: rp });
  });
  const gapBands = new Map();
  gapTenders.forEach(({ t, rival }) => {
    const lo = Math.floor(rival.kva / 250) * 250;
    const key = `${rival.hz} Hz · ${lo.toLocaleString()}–${(lo + 250).toLocaleString()} kVA`;
    const b = gapBands.get(key) || { band: key, v: 0, n: 0, rivals: new Set() };
    b.v += mid(t);
    b.n += 1;
    b.rivals.add(rival.name);
    gapBands.set(key, b);
  });

  /* 6. route to market: contractors / channels named on the tenders (not OEMs) */
  const channels = new Map();
  ok.forEach((t) => {
    (t.competitors || []).forEach((raw) => {
      const name = String(raw).split(/[(:;]/)[0].trim();
      if (!name || name.length < 3 || OEM_RX.test(name)) return;
      const c = channels.get(name) || { name, v: 0, n: 0, tied: (TIED.find(([rx]) => rx.test(name)) || [])[1] || null };
      c.v += mid(t);
      c.n += 1;
      channels.set(name, c);
    });
  });

  /* 7. repeat buyers: programmes and accounts that tender again and again */
  const buyers = new Map();
  (data.tenders || []).forEach((t) => {
    const b = String(t.issuer || "").split(/[(,]/)[0].trim();
    if (!b) return;
    const r = buyers.get(b) || { buyer: b, n: 0, v: 0 };
    r.n += 1;
    r.v += fits(t) ? mid(t) : 0;
    buyers.set(b, r);
  });

  /* 8. this week: the analyst's dated actions, soonest first */
  const actions = all.flatMap((t) => (t.actions || []).map((a) => ({ ...a, tender: t })))
    .map((a) => ({ ...a, days: Math.ceil((Date.parse(a.due) - today.getTime()) / DAY) }))
    .sort((a, b) => a.days - b.days);

  /* 9. the opportunity map: one point per ranked tender */
  const points = all.map((t) => {
    const d = decisionOf(t, today);
    return { t, date: d.date, est: d.est, fit: t.cumminsFit, v: mid(t), cat: t.cat };
  });

  return {
    headline: { inPlay: funnel[0].v, fits: funnel[1].v, closingSoon: sum(closingSoon), closingN: closingSoon.length,
                ranked: all.length, poor: all.length - ok.length },
    funnel,
    forecast,
    segments: group("cat"),
    countries: group("country"),
    rivals: [...rivals.values()].sort((a, b) => b.v - a.v),
    pairs: [...pairs.values()].sort((a, b) => b.v - a.v),
    gap: { v: sum(gapTenders.map((g) => g.t)), n: gapTenders.length,
           bands: [...gapBands.values()].map((b) => ({ ...b, rivals: [...b.rivals] })).sort((a, b) => b.v - a.v) },
    channels: [...channels.values()].sort((a, b) => b.v - a.v),
    buyers: [...buyers.values()].filter((b) => b.n >= 2).sort((a, b) => b.n - a.n || b.v - a.v),
    actions,
    points,
  };
}

export const usdM = (v) => (v >= 1e6 ? `USD ${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `USD ${Math.round(v / 1e3)}k`);
