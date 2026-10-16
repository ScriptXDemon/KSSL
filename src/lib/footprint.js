/* The client's market footprint, in tiers.
 *
 * The audited table that used to live here (five markets with source URLs, one unresolved
 * region, the client's business lines) was hand-typed record data about the client, and is
 * gone. The client's footprint is stored: competitive_geo_company_presence where
 * company_role = 'client' (shipped as geoData[<client id>]). Until a tier is stored for a
 * market, no market has a tier: tierOf answers "none" with no row, tieredCountries() is
 * empty, and the shortlist's market test cannot run (it keeps the card, as it does for any
 * dataset with no footprint to test against).
 *
 * T7: shortlist.js, the only reader, is deleted there (ruling R5); this file goes with it.
 */

/* T0 home market            country of incorporation and primary customer
   T1 evidenced export       a signed contract, delivery or in-service fleet, country named
   T2 contested              a named bid or an incorporated local entity, but no sale
   T3 no presence            everything else */
export const T0 = "home";
export const T1 = "export";
export const T2 = "contested";
export const T3 = "none";

/* No tier is stored for any market. */
export function tierOf() {
  return { tier: T3, row: null };
}

/* No line-scoped evidence is stored: everything matches. */
export function withinLines() {
  return true;
}

/* Every country with a stored tier: none. */
export function tieredCountries() {
  return [];
}
