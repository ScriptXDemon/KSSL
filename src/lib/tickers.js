/* A competitor's stock ticker is data: competitors[cid].ticker (serving.competitive_stock_quote.ticker).
   There is no table of tickers, id aliases or "not listed" sentences in code, and no ticker is built from
   a company id or a country. A company with no stored ticker has none. */
export function tickerFor(cid, competitors) {
  const row = competitors && cid ? competitors[cid] : null;
  return (row && row.ticker) || null;
}
