/* SERVER-SIDE company pulse: live stock quote (Yahoo Finance chart API, keyless) and
 * "trending" headlines (Google News RSS, keyless). Runs on the server (vite dev/preview
 * middleware locally, the FastAPI backend in production) — never in the browser, because
 * the page's CSP forbids cross-origin fetches and these hosts would block them anyway.
 * It fetches, parses and normalises; it invents nothing — a source that returns nothing
 * yields null/[], and the card says so.
 *
 * ponytail: plain regex RSS parse and one chart call — no xml/finance dependency for two
 * well-known feeds. Upgrade to a parser if the shapes ever get hairy.
 */
const UA = "Mozilla/5.0 (compatible; ParallaxPulse/1.0)";

export async function fetchStock(ticker) {
  if (!ticker) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  const m = res && res.meta;
  if (!m || typeof m.regularMarketPrice !== "number") return null;
  const price = m.regularMarketPrice;
  // series for the sparkline: valid closes over the 1-month window
  let series = [];
  try {
    series = (res.indicators.quote[0].close || []).filter((x) => typeof x === "number");
  } catch { series = []; }
  /* DAILY change: use the previous CLOSE, i.e. the second-to-last close in the series.
     meta.chartPreviousClose over a 1-month range is the pre-window (month-ago) close,
     which would report a monthly move as if it were today's -- so it is NOT used here. */
  const prev = series.length >= 2 ? series[series.length - 2]
    : (typeof m.chartPreviousClose === "number" ? m.chartPreviousClose : m.previousClose);
  const change = typeof prev === "number" ? price - prev : null;
  const pct = typeof prev === "number" && prev ? (change / prev) * 100 : null;
  return {
    symbol: m.symbol || ticker,
    name: m.longName || m.shortName || null,
    price,
    previousClose: typeof prev === "number" ? prev : null,
    change,
    changePct: pct == null ? null : Math.round(pct * 100) / 100,
    currency: m.currency || null,
    exchange: m.fullExchangeName || m.exchangeName || null,
    asOf: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    series: series.slice(-22),
  };
}

/* Decode the handful of XML/HTML entities an RSS title carries. */
function unent(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

/* Resolve a news.google.com/rss/articles/CBMi... link to the REAL article URL via
 * Google's batchexecute endpoint (mirrors backend _pulse_resolve). Cached 24h; returns ""
 * on any failure so the caller falls back to the publisher homepage. Fragile by nature. */
const _resolveCache = new Map();
async function resolveArticle(googleUrl) {
  if (!googleUrl || !googleUrl.includes("news.google.com/rss/articles/")) return "";
  const id = googleUrl.split("/articles/")[1].split("?")[0];
  const c = _resolveCache.get(id);
  if (c && c.exp > Date.now()) return c.url;
  let url = "";
  try {
    const html = await (await fetch(googleUrl, { headers: { "User-Agent": UA } })).text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/);
    const ts = html.match(/data-n-a-ts="([^"]+)"/);
    if (sg && ts) {
      const payload = [[["Fbv4je", `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts[1]},"${sg[1]}"]`, null, "generic"]]];
      const body = "f.req=" + encodeURIComponent(JSON.stringify(payload));
      const resp = await (await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body })).text();
      const seg = resp.includes("garturlres") ? resp.split("garturlres")[1] : resp;
      const m = seg.match(/https?:\/\/[^\\"]+/);
      if (m) url = m[0];
    }
  } catch { url = ""; }
  _resolveCache.set(id, { url, exp: Date.now() + 86400000 });
  return url;
}
/* The article's OWN og:image, from the resolved page -- grounded (the publisher's declared
 * image for THIS story, the same basis the sourced cards use), so never a wrong photo.
 * Cached 24h; null on failure so the card shows the honest placeholder. Only real article
 * pages (never the news.google.com wrapper). Mirrors backend _pulse_ogimage. */
const _imgCache = new Map();
async function articleImage(url) {
  if (!url || !/^https?:/.test(url) || url.includes("news.google.com")) return null;
  const c = _imgCache.get(url);
  if (c && c.exp > Date.now()) return c.img;
  let img = null;
  try {
    const html = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
    const m = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
           || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i);
    if (m && /^https?:/.test(m[1])) img = unent(m[1]);
  } catch { img = null; }
  _imgCache.set(url, { img, exp: Date.now() + 86400000 });
  return img;
}

/* One Google-News RSS query -> up to 6 normalised, link-resolved items. */
async function _rssItems(query) {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const xml = await r.text();
  const items = xml.split("<item>").slice(1);
  const out = [];
  for (const it of items) {
    const title = unent((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = unent((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    const srcurl = unent((it.match(/<source[^>]*url="([^"]*)"/) || [])[1]);
    const date = unent((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const source = unent((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
    if (!title) continue;
    // Google appends " - <Source>" to the title; strip it, we show source separately
    const clean = source && title.endsWith(" - " + source) ? title.slice(0, -(source.length + 3)) : title;
    // Resolve to the EXACT article (fall back to publisher homepage); card image is the
    // article's own og:image, only when we resolved the real page (else the placeholder).
    const resolved = await resolveArticle(link);
    const finalUrl = resolved || srcurl || link || null;
    const image = resolved ? await articleImage(resolved) : null;
    out.push({ title: clean, url: finalUrl, source: source || null, image, date: date ? new Date(date).toISOString() : null });
    if (out.length >= 6) break;
  }
  return out;
}

export async function fetchTrending(name, product = "") {
  if (!name) return [];
  const p = String(product || "").trim();
  /* Progressive broadening: an exact quoted product first, then the product unquoted with
     its maker, then maker-only -- so a terse/obscure product code ("HE M 107") that the
     strict query returns nothing for still surfaces relevant coverage instead of an empty
     feed. Each step runs only when the previous found nothing; a zero-result RSS fetch is
     cheap (no link-resolution happens until a step actually returns items). */
  const queries = p
    ? [`"${p}" ${name} defence OR defense`, `${p} ${name}`, `"${name}" defence OR defense`]
    : [`"${name}" defence OR defense`];
  for (const query of queries) {
    const items = await _rssItems(query);
    if (items.length) return items;
  }
  return [];
}

export async function fetchPulse({ name, ticker, product }) {
  const [stock, trending] = await Promise.all([
    fetchStock(ticker).catch(() => null),
    fetchTrending(name, product).catch(() => []),
  ]);
  return { stock, trending, fetchedAt: new Date().toISOString() };
}

/* ===================== STOCK HISTORY + THE NEWS AROUND EACH BIG MOVE =====================
 * The Stock card's page. Prices are Yahoo's daily (weekly for 5y) closes. A "move" is a day
 * whose change is unusually large for THIS stock (>= 2 standard deviations of its own daily
 * changes, and at least 2%). For each move we list headlines Google News dates to around
 * that day. That is CONTEXT, not a proven cause -- the page says so; nothing here claims why
 * a price moved. Cached 30 min per (ticker, range). Mirrors backend /api/pulse/history. */
const RANGES = { "1mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1wk" };
const _histCache = new Map();

export function findMoves(points, max = 8) {
  const rets = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1].c, b = points[i].c;
    if (a > 0 && b > 0) rets.push({ i, r: (b - a) / a });
  }
  if (rets.length < 5) return [];
  const mean = rets.reduce((s, x) => s + x.r, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x.r - mean) ** 2, 0) / rets.length);
  const cut = Math.max(0.02, 2 * sd);
  return rets
    .filter((x) => Math.abs(x.r) >= cut)
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
    .slice(0, max)
    .map(({ i, r }) => ({
      date: points[i].t, from: points[i - 1].c, to: points[i].c,
      pct: Math.round(r * 10000) / 100, dir: r < 0 ? "drop" : "rise",
    }))
    .sort((x, y) => (x.date < y.date ? 1 : -1));
}

/* Google News for a date window, WITHOUT per-article resolution (the page lists up to 8
   moves x 3 headlines; resolving each is ~3 requests). Links open through Google News. */
async function _rssLite(query, max = 3) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const out = [];
  for (const it of (await r.text()).split("<item>").slice(1)) {
    const title = unent((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = unent((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    const date = unent((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const source = unent((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
    if (!title) continue;
    const clean = source && title.endsWith(" - " + source) ? title.slice(0, -(source.length + 3)) : title;
    out.push({ title: clean, url: link || null, source: source || null, date: date ? new Date(date).toISOString() : null });
    if (out.length >= max) break;
  }
  return out;
}

const _day = (iso, add) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
};
// "Larsen & Toubro Limited" -> "Larsen & Toubro": the listed name, minus the legal suffix
export const searchName = (n) =>
  String(n || "").replace(/\b(Limited|Ltd\.?|Inc\.?|Corporation|Corp\.?|plc|PLC|S\.A\.|AG|SE)\b\.?/g, "").replace(/\s+/g, " ").trim();

export async function fetchStockHistory({ ticker, range = "1y", name = "" }) {
  if (!ticker) return null;
  const rg = RANGES[range] ? range : "1y";
  const key = `${ticker}|${rg}`;
  const hit = _histCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${RANGES[rg]}&range=${rg}`,
    { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const res = (((await r.json()) || {}).chart || {}).result;
  const x = res && res[0];
  if (!x || !x.meta) return null;
  const ts = x.timestamp || [];
  const closes = ((x.indicators || {}).quote || [{}])[0].close || [];
  const points = ts.map((t, i) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), c: closes[i] }))
    .filter((p) => typeof p.c === "number");
  const listed = searchName(x.meta.longName || x.meta.shortName || name) || name;
  const moves = findMoves(points);
  // headlines published from 3 days before to 2 days after each move
  await Promise.all(moves.map(async (m) => {
    m.news = await _rssLite(`"${listed}" after:${_day(m.date, -3)} before:${_day(m.date, 3)}`).catch(() => []);
  }));
  const first = points[0], last = points[points.length - 1];
  const val = {
    symbol: x.meta.symbol || ticker, name: x.meta.longName || x.meta.shortName || null, searchedAs: listed,
    currency: x.meta.currency || null, exchange: x.meta.fullExchangeName || x.meta.exchangeName || null,
    price: x.meta.regularMarketPrice ?? (last && last.c), range: rg,
    rangeChangePct: first && last && first.c ? Math.round(((last.c - first.c) / first.c) * 10000) / 100 : null,
    high: points.length ? Math.max(...points.map((p) => p.c)) : null,
    low: points.length ? Math.min(...points.map((p) => p.c)) : null,
    points, moves, fetchedAt: new Date().toISOString(),
  };
  _histCache.set(key, { val, exp: Date.now() + 30 * 60 * 1000 });
  return val;
}
