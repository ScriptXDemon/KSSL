/* Tender judgements are STORED fields; this module only reads them (ruling R6).

   The fit grade (`clientFit`), the revenue estimate (`revenueMid`, the midpoint of the stored
   estimate range) and the cockpit tables (`topOpportunities`) come from the dataset. A field
   that is absent reads as null, never as a computed stand-in: the cockpit used to weight value
   by fit, assume win probabilities and order lags, and rank rivals and gaps from the product
   catalogue. None of that is database content, so it is gone. */

const has = (v) => v != null && String(v).trim() !== "";

/* the stored fit word (strong / partial / weak), as it is, or null */
export const fitOf = (t) => (t && has(t.clientFit) ? String(t.clientFit).trim() : null);

/* the stored revenue estimate midpoint, or null; a missing estimate is not zero */
export const revenueOf = (t) => {
  if (!t || !has(t.revenueMid)) return null;
  const n = Number(t.revenueMid);
  return Number.isFinite(n) ? n : null;
};

/* the cockpit tables exactly as stored: rows in stored order, no re-ranking */
export function cockpit(data) {
  const o = (data && data.topOpportunities) || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    tenders: list(o.topTenders),
    projects: list(o.projectsBeforeTender),
    moves: list(o.nextMoves),
    notes: o.notes || {},
  };
}
