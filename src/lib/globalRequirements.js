/* GLOBAL REQUIREMENTS: the worldwide market signals the dataset already carries.

   A market card whose meta names "Global" as its country (card.meta = "Category · Global · Segment · date") is a
   signal about demand, capacity or supply outside any one buyer's country: Cummins Inc.'s data-centre order book,
   its capacity plan, a rental fleet deal, industry lead times. Nothing is added here: each row is a card the
   market feed serves, its `why` is the card's own read for the client, and its link is the card's source. */
export const isGlobalCard = (c) => String((c && c.meta) || "").split(" · ").includes("Global");

export function globalRequirements(d) {
  const det = (d && d.details) || {};
  return ((d && d.marketCards) || []).filter(isGlobalCard).map((c) => {
    const x = det[c.id] || {};
    const [category, , segment] = String(c.meta).split(" · ");
    return {
      id: c.id, title: c.title, category, segment: segment && !/^\d/.test(segment) ? segment : "", date: c.ago || "",
      what: x.what || "", why: x.why || c.sowhat || "", url: x.url || c.url || "", sources: x.srcs || [],
    };
  }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("globalRequirements.js")) {
  const d = { marketCards: [{ id: "a", title: "T", meta: "Capacity · Global · Data centre · 02 Oct 2026", ago: "02 Oct 2026" }, { id: "c", title: "U", meta: "Risk outlook · Global · 03 Sep 2026", ago: "03 Sep 2026" }, { id: "e", title: "V", meta: "Risk outlook · Global · 10 Oct 2026", ago: "10 Oct 2026" }, { id: "b", meta: "Pipeline · Saudi Arabia · Utility · 01 Oct 2026" }], details: { a: { why: "W", url: "https://x.com" } } };
  const r = globalRequirements(d);
  if (r.length !== 3 || r[0].id !== "e" || r[2].id !== "c" || r[1].category !== "Capacity" || r[1].segment !== "Data centre" || r[1].why !== "W") throw new Error("globalRequirements self-check failed");
  console.log("ok");
}
