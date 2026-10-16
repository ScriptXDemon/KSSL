/* Tender values are never converted. A tender states one amount in one currency
   (serving.market_tender.value_amount + value_currency, shipped as valueAmount / valueCurrency);
   a total is a sum per currency, and a mixed set is shown as one total for each. No exchange
   rate exists anywhere in code or in the loader (ruling R9). */

/* the field names a record keeps its amount and currency under: tenders use the default, awards use AWARD_FIELDS */
export const TENDER_FIELDS = { amount: "valueAmount", currency: "valueCurrency" };
export const AWARD_FIELDS = { amount: "value", currency: "currency" };

export const hasAmount = (t, f = TENDER_FIELDS) => !!t && Number(t[f.amount]) > 0 && !!String(t[f.currency] || "").trim();

/* [{ currency, amount, n }], one per stored currency, in currency-code order */
export function valueTotals(list, f = TENDER_FIELDS) {
  const by = {};
  (list || []).filter((t) => hasAmount(t, f)).forEach((t) => {
    const c = String(t[f.currency]).trim();
    const e = by[c] || (by[c] = { currency: c, amount: 0, n: 0 });
    e.amount += Number(t[f.amount]);
    e.n += 1;
  });
  return Object.values(by).sort((a, b) => a.currency.localeCompare(b.currency));
}

const short = (n) => (n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString("en-US")} m` : Math.round(n).toLocaleString("en-US"));

/* "USD 1,070 m · EUR 9 m", or "—" when no tender states an amount */
export function formatTotals(totals) {
  return totals && totals.length ? totals.map((t) => `${t.currency} ${short(t.amount)}`).join(" · ") : "—";
}
