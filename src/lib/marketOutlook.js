/* MARKET OUTLOOK: where demand is heading, who wins, what sizes buyers need, who re-tenders, what drives it.

   Every figure is counted from records the dataset serves and each section says which records it used:
     tenders      data.tenders (Published or Closes date from the row's req list, category `cat`)
     awards       data.awards (winner, value_usd, buyer, segment, date or year)
     signals      data.marketCards that are not tenders (meta "Kind · Country · Segment · date")
   Nothing is invented. A date a record does not carry is not guessed: a year-only award counts as an award, not as
   activity in a quarter. "Revenue" is the pack's own estimate (tender.revenueMid, USD), labelled as an estimate. */

const DAY = 86400000;
export const WINDOW_DAYS = 183;      // "last 6 months" is this many days back from today, and the same again before it
const MIN_BEFORE = 3;                // fewer than this in the earlier window: no trend is called
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/* "15 Oct 2026", "2026-10-15" or "2026-10-15 09:59" -> Date (UTC), else null */
export function asDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  return null;
}

const reqVal = (t, k) => ((t.req || []).find((r) => r[0] === k) || [])[1];
const tenderDate = (t) => asDate(reqVal(t, "Published")) || asDate(reqVal(t, "Closes")) || asDate(t.closingDate);

/* one name per segment, whichever record spelled it: "Service / Facilities" and "Utility / Power plant" are read by
   their first word; Other (an award to a university, ministry or municipality) is government buying */
const SEG_ALIAS = { "Data centres": "Data centre", "Grid reliability": "Utility", "Rental/Events": "Rental", Other: "Government", Facilities: "Service" };
export function segmentOf(s, fromCard = false) {
  const x = String(s || "Other").split(" / ")[0].replace(/ and /i, " & ").trim();
  return fromCard && x === "Other" ? "Other" : SEG_ALIAS[x] || x;
}
export const SEGMENT_LABEL = { Government: "Government & public buildings" };
export const segmentLabel = (s) => SEGMENT_LABEL[s] || s;

/* a market card's meta: "Pipeline · Saudi Arabia · Data centre · 24 Sep 2026" (or without a segment) */
export function cardMeta(c) {
  const p = String((c && c.meta) || "").split(" · ").map((x) => x.trim());
  const date = asDate(p[p.length - 1]);
  return { kind: p[0] || "", country: p[1] || "", segment: p.length > 3 ? p[2] : "", date };
}
const isRealCountry = (c) => !!c && !/^(global|worldwide|international)$/i.test(c) && c.length < 40 && !/[,(]/.test(c);
const revenueOf = (t) => (t.clientFit === "poor" ? 0 : Number(t.revenueMid) || 0);
const fits = (t) => t.clientFit === "strong" || t.clientFit === "partial";

/* winner names differ in case, "Co." and "group": one key per company */
const winnerKey = (n) => String(n || "").toLowerCase().replace(/\b(co|company|ltd|llc|group|est|establishment|trading)\b\.?/g, "").replace(/[^a-z0-9؀-ۿ]+/g, "");

/* ---- 1. where demand is heading, by segment ---- */
export function segments(d, openTenders, today = new Date(), closedTenders = []) {
  const t0 = today.getTime();
  const cut = t0 - WINDOW_DAYS * DAY;
  const cut2 = cut - WINDOW_DAYS * DAY;
  const known = new Set();
  (d.tenders || []).forEach((t) => known.add(segmentOf(t.cat)));
  (d.awards || []).forEach((a) => known.add(segmentOf(a.segment)));
  const by = new Map();
  const bump = (seg, date, kind) => {
    if (!known.has(seg)) return;
    const r = by.get(seg) || { segment: seg, recent: 0, before: 0, tenders: 0, signals: 0, awards: 0 };
    r[kind] += 1;
    if (date) {
      const t = date.getTime();
      if (t <= t0 && t > cut) r.recent += 1;
      else if (t <= cut && t > cut2) r.before += 1;
    }
    by.set(seg, r);
  };
  (d.tenders || []).forEach((t) => bump(segmentOf(t.cat), tenderDate(t), "tenders"));
  (d.marketCards || []).map(cardMeta).filter((m) => m.kind !== "Tender" && m.segment).forEach((m) => bump(segmentOf(m.segment, true), m.date, "signals"));
  (d.awards || []).forEach((a) => bump(segmentOf(a.segment), asDate(a.date), "awards"));

  const fit = (openTenders || []).filter(fits);
  // closed for bids, award not yet made or published: still a live lead for the buyer's next round
  const waiting = (closedTenders || []).filter((t) => fits(t) && String(t.status || "").toLowerCase() !== "awarded");
  const won = (d.awards || []).filter((a) => a.winner);
  const latestSignal = new Map();
  (d.marketCards || []).forEach((c) => {
    const m = cardMeta(c);
    if (m.kind === "Tender" || !m.segment) return;
    const seg = segmentOf(m.segment, true);
    const cur = latestSignal.get(seg);
    if (!cur || (m.date && (!cur.date || m.date > cur.date))) latestSignal.set(seg, { title: c.title, kind: m.kind, country: m.country, date: m.date });
  });
  return [...by.values()].map((r) => {
    const mine = fit.filter((t) => segmentOf(t.cat) === r.segment);
    const aw = won.filter((a) => segmentOf(a.segment) === r.segment);
    const usd = new Map();
    aw.forEach((a) => {
      const k = winnerKey(a.winner);
      const cur = usd.get(k) || { name: a.winner, usd: 0 };
      cur.usd += a.value_usd || 0;
      usd.set(k, cur);
    });
    const total = [...usd.values()].reduce((n, x) => n + x.usd, 0);
    const top = [...usd.values()].sort((a, b) => b.usd - a.usd)[0];
    const called = r.before >= MIN_BEFORE;
    const trend = !called ? "not enough history" : r.recent > r.before * 1.25 ? "rising" : r.recent < r.before * 0.75 ? "falling" : "steady";
    const open = mine.length;
    const pend = waiting.filter((t) => segmentOf(t.cat) === r.segment);
    const pending = { n: pend.length, value: pend.reduce((n, t) => n + revenueOf(t), 0), titles: pend.map((t) => t.title) };
    const act = !called && !open && pending.n
      ? `Watch: ${pending.n} closed tender${pending.n === 1 ? "" : "s"} ${pending.n === 1 ? "awaits" : "await"} award`
      : !called
      ? open ? `Pursue: ${open} open tender${open === 1 ? "" : "s"} fit` : "Too few dated records to call a trend"
      : trend === "rising" ? (open ? "Prioritise: growing, and open tenders fit" : "Growing, but no open tender fits a client model")
        : trend === "falling" ? "Slowing: check before adding effort"
          : open ? "Steady: keep covering it" : "Steady, nothing open fits";
    return {
      segment: r.segment, recent: r.recent, before: r.before, called, trend,
      change: called ? Math.round(((r.recent - r.before) / r.before) * 100) : null,
      records: { tenders: r.tenders, signals: r.signals, awards: r.awards },
      open, value: mine.reduce((n, t) => n + revenueOf(t), 0),
      winner: top && top.usd ? top.name : null, winnerShare: top && total ? top.usd / total : null,
      winnerWins: top ? aw.filter((a) => winnerKey(a.winner) === winnerKey(top.name)).length : 0, named: aw.length, act,
      pending, latest: latestSignal.get(r.segment) || null,
    };
  }).filter((r) => r.recent || r.before || r.open).sort((a, b) => b.value - a.value || b.recent - a.recent);
}

/* ---- 2. who wins ---- */
export function winners(d) {
  const all = d.awards || [];
  const won = all.filter((a) => a.winner);
  const priced = won.filter((a) => a.value_usd);
  const total = priced.reduce((n, a) => n + a.value_usd, 0);
  const by = new Map();
  won.forEach((a) => {
    const k = winnerKey(a.winner);
    const r = by.get(k) || { winner: a.winner, wins: 0, usd: 0, brand: null, buyers: new Set() };
    r.wins += 1;
    r.usd += a.value_usd || 0;
    r.buyers.add(a.buyer);
    if (!r.brand && a.brand) r.brand = a.brand;
    by.set(k, r);
  });
  const rows = [...by.values()].map((r) => ({ ...r, buyers: [...r.buyers], share: total ? r.usd / total : 0 }))
    .sort((a, b) => b.usd - a.usd || b.wins - a.wins);
  // awards for running or servicing equipment rather than supplying it, so a reader can discount them
  const svc = priced.filter((a) => /\b(maintenance|operation|operat|repair|rehabilit|cleaning)\b/i.test(`${a.programme || ""} ${a.title || ""}`));
  const svcUsd = svc.reduce((n, a) => n + a.value_usd, 0);
  return { records: all.length, named: won.length, priced: priced.length, totalUsd: total, rows, serviceAwards: svc.length, serviceShare: total ? svcUsd / total : 0 };
}

/* ---- 3. sizes buyers need, against the client's catalogue ---- */
const BANDS = [[0, 500], [500, 750], [750, 1000], [1000, 1250], [1250, 1500], [1500, 1750], [1750, 2000], [2000, 2500], [2500, 3000], [3000, 3500], [3500, 1e9]];
const bandOf = (kva) => BANDS.find(([lo, hi]) => kva >= lo && kva < hi);
const bandText = ([lo, hi]) => (hi >= 1e9 ? `${lo.toLocaleString("en-US")}+ kVA` : `${lo.toLocaleString("en-US")}-${hi.toLocaleString("en-US")} kVA`);
const kvaOf = (p) => {
  const s = (p && p.specs && (p.specs["Standby rating"] || p.specs["Prime rating"])) || "";
  const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*kVA/i);
  return m ? Number(m[1]) : null;
};
export function sizes(d) {
  const own = (d.client && (d.client.id || d.client.short));
  const cat = Object.entries(d.competitors || {}).flatMap(([cid, c]) =>
    (c.products || []).map((p) => ({ own: cid === own, name: p.name, hz: Number(p.hz) || null, kva: kvaOf(p) })));
  const byName = new Map(cat.map((p) => [p.name, p]));
  const rows = new Map();
  let named = 0;
  (d.tenders || []).filter((t) => t.rank && t.clientFit !== "poor").forEach((t) => {
    const rival = (t.competitorFit || [])[0];
    const p = (rival && (rival.products || []).map((n) => byName.get(n)).find((x) => x && x.kva && x.hz))
      || (t.matches || []).map((m) => byName.get(m.n)).find((x) => x && x.kva && x.hz);
    if (!p) return;
    named += 1;
    const b = bandOf(p.kva);
    const key = `${p.hz} Hz · ${bandText(b)}`;
    const r = rows.get(key) || { key, hz: p.hz, lo: b[0], tenders: 0, value: 0 };
    r.tenders += 1;
    r.value += revenueOf(t);
    rows.set(key, r);
  });
  const out = [...rows.values()].map((r) => {
    const models = cat.filter((p) => p.own && p.hz === r.hz && p.kva && bandOf(p.kva)[0] === r.lo).map((p) => p.name);
    return { ...r, models, covered: models.length > 0 };
  }).sort((a, b) => b.value - a.value);
  return { named, ranked: (d.tenders || []).filter((t) => t.rank && t.clientFit !== "poor").length, rows: out };
}

/* ---- 4. repeat buyers ---- */
const buyerName = (s) => String(s || "").split(/\s*\(| via /)[0].replace(/,\s*(General|Services|Central|Engineering|Supply|Procurement|Local|Contracts)\b.*$/i, "").trim();
export function buyers(d, today = new Date()) {
  const by = new Map();
  const get = (name) => by.get(name) || { buyer: name, tenders: 0, awards: 0, value: 0, segments: new Set(), dates: [] };
  (d.tenders || []).forEach((t) => {
    const name = buyerName(t.issuer);
    if (!name) return;
    const r = get(name);
    r.tenders += 1;
    r.value += revenueOf(t);
    r.segments.add(segmentOf(t.cat));
    const dt = tenderDate(t);
    if (dt) r.dates.push(dt.getTime());
    by.set(name, r);
  });
  (d.awards || []).forEach((a) => {
    const name = buyerName(a.buyer);
    if (!name) return;
    const r = get(name);
    r.awards += 1;
    r.segments.add(segmentOf(a.segment));
    const dt = asDate(a.date);
    if (dt) r.dates.push(dt.getTime());
    by.set(name, r);
  });
  return [...by.values()].filter((r) => r.tenders + r.awards >= 2).map((r) => {
    const dates = [...new Set(r.dates)].sort((a, b) => a - b);
    const gaps = dates.slice(1).map((x, i) => x - dates[i]).filter((g) => g >= 30 * DAY).sort((a, b) => a - b);
    const cadence = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] / DAY) : null;
    const last = dates.length ? new Date(dates[dates.length - 1]) : null;
    const next = cadence && last ? new Date(last.getTime() + cadence * DAY) : null;
    return { buyer: r.buyer, tenders: r.tenders, awards: r.awards, count: r.tenders + r.awards, value: r.value, segments: [...r.segments],
      cadenceDays: cadence, last, next, overdue: !!(next && next < today), dated: dates.length };
  }).sort((a, b) => b.count - a.count || b.value - a.value);
}

/* ---- 5. what is driving it: market news by country and segment, beside the tenders open there ---- */
export function drivers(d) {
  const by = new Map();
  (d.marketCards || []).forEach((c) => {
    const m = cardMeta(c);
    if (m.kind === "Tender" || !m.segment || !isRealCountry(m.country)) return;
    const seg = segmentOf(m.segment, true);
    const key = `${m.country}||${seg}`;
    const r = by.get(key) || { country: m.country, segment: seg, signals: [], tenders: 0, value: 0 };
    r.signals.push({ kind: m.kind, title: c.title, date: m.date });
    by.set(key, r);
  });
  (d.tenders || []).filter((t) => t.rank).forEach((t) => {
    const r = by.get(`${t.country}||${segmentOf(t.cat)}`);
    if (!r) return;
    r.tenders += 1;
    r.value += revenueOf(t);
  });
  by.forEach((r) => r.signals.sort((a, b) => ((b.date && b.date.getTime()) || 0) - ((a.date && a.date.getTime()) || 0)));
  return [...by.values()].sort((a, b) => b.signals.length - a.signals.length || b.value - a.value);
}

export function outlook(d, openTenders, today = new Date(), closedTenders = []) {
  return { segments: segments(d, openTenders, today, closedTenders), winners: winners(d), sizes: sizes(d), buyers: buyers(d, today), drivers: drivers(d) };
}

export const usd = (n) => (n ? (n >= 1e6 ? `USD ${(n / 1e6).toFixed(1)}M` : `USD ${Math.round(n / 1e3)}k`) : "—");

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("marketOutlook.js")) {
  const today = new Date("2026-10-15T00:00:00Z");
  const d = {
    client: { id: "C" },
    tenders: [
      { cat: "Service / Facilities", req: [["Published", "01 Oct 2026"]], rank: 1, clientFit: "strong", revenueMid: 1e6, country: "Kuwait", issuer: "KNPC (Kuwait)", competitorFit: [{ products: ["R1"] }] },
      { cat: "Service / Facilities", req: [["Published", "01 Aug 2026"]], issuer: "KNPC" },
      { cat: "Healthcare", req: [["Closes", "2026-03-01"]], issuer: "MoH" },
    ],
    awards: [
      { segment: "Service", winner: "A Trading Co.", value_usd: 100, buyer: "KNPC", date: "2026-09-01" },
      { segment: "Service", winner: "A Trading", value_usd: 50, buyer: "KNPC", date: null, year: 2025 },
      { segment: "Other", winner: "B", value_usd: null, buyer: "MoH", date: "2026-02-01" },
    ],
    marketCards: [{ meta: "Pipeline · Saudi Arabia · Service · 02 Oct 2026", title: "S" }, { meta: "Demand shift · Global · Service · 02 Oct 2026", title: "G" }, { meta: "Tender · X · closes 08 Oct 2026", title: "T" }],
    competitors: { C: { products: [{ name: "C1", hz: 50, specs: { "Standby rating": "1,100 kVA" } }] }, R: { products: [{ name: "R1", hz: 50, specs: { "Standby rating": "1,200 kVA" } }] } },
  };
  const s = segments(d, d.tenders.slice(0, 1), today, [{ cat: "Healthcare", status: "evaluation", clientFit: "partial", revenueMid: 5, title: "X" }]);
  const svc = s.find((r) => r.segment === "Service");
  const w = winners(d);
  const z = sizes(d).rows[0];
  const b = buyers(d, today);
  const ok = svc && svc.recent === 5 && svc.winner === "A Trading Co." && svc.winnerWins === 2 && svc.open === 1 && !svc.called && svc.latest && svc.latest.title === "S" && s.find((r) => r.segment === "Healthcare").pending.n === 1
    && w.rows[0].wins === 2 && w.priced === 2 && z.key === "50 Hz · 1,000-1,250 kVA" && z.covered
    && b[0].buyer === "KNPC" && b[0].count === 4 && drivers(d).length === 1 && w.serviceAwards === 0 && drivers(d)[0].country === "Saudi Arabia"
    && segmentOf("Other") === "Government" && asDate("15 Oct 2026").getUTCMonth() === 9;
  if (!ok) throw new Error("marketOutlook self-check failed " + JSON.stringify({ svc, w: w.rows[0], z, b: b[0] }));
  console.log("ok");
}
