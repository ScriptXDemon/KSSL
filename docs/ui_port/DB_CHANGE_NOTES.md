# DB change notes from frontend changes

Frontend-only changes that touch what a table holds or how it is used. **Nothing here has been applied to any
database**; each entry says what would change if the DB side is ever aligned.

## 2026-10-17 · "Competitor Moment" renamed "Competitor Movement"

Frontend: the rail label (`src/lib/route.js`), the page eyebrow, the drawer view/title and the empty text
(`src/pages/competitive/ThreatAnalysis.jsx`). The route key stays `threat-analysis`, and code names stay `moment*`.

DB impact: **none required.** The label is front-end chrome; no table carries the visible word today
(no `staging_ui` row contains "moment"). Only names would differ, if renamed for consistency later:
- staging/serving tables `competitive_competitor_moment`, `competitive_competitor_moment_source`,
  `competitive_competitor_moment_analysis`
- ui tables `competitive_competitor_moment_level`, `competitive_competitor_moment_time_window`,
  `ui_competitor_moment_metric`, `ui_competitor_moment_view_state`
- prompt `prompts/moment.yml` (its output text should say "movement" where it addresses the reader)

## 2026-10-17 · Competitor Profile: "Global locations" removed

Frontend: the Global Locations row of Company details, its line in Print/Export, and its field in the Copy
payload (`src/pages/competitive/Profile.jsx`; the unused `.cp-loc-*` CSS deleted).

DB impact: `serving.competitive_competitor_location` (318 rows, 50 competitors in local staging;
loaded by `backend/location_load.py`, shipped as `competitors[].global_locations` by
`backend/areas/a_competitive.py`) is **no longer displayed on the profile**. It is **still read** by the
country filter (`src/lib/countryFacet.js` unions geo footprint + global_locations + HQ), so the table and its
loader stay needed. Drop it only if the country filter stops using it too.

## 2026-10-17 · Geo Footprint rebuilt to the reference (Cummins :8101) layout

Frontend (`src/lib/geo.js`, `src/pages/competitive/Geo.jsx`):
- market list: the client row in the client colour reading "<client> present"; badges "◉ overlap" / "◎ category only",
  country badges "◉ N contested" / "◎ N category only"
- client → country: the reference overlap table (Rival · Overlapping categories · Matched pairs · Datasheet outcome ·
  Presence), then "What this means for <client>" (the stored geo analysis, moved here from the top of the market list)
- rival → country: "Products <rival> sells" with each product's client counter and verdict pill, and the product
  comparison pane (grouped spec table, ▲ on the winning side, gap, "ahead on" lines, qualitative differences)

Everything is read from existing stored rows; nothing is paired or graded in the browser. **No table change required.**
Tables read: `serving.competitive_geo_company_presence` (overlap_status, matched_ranges, activity),
`serving.competitive_matchup` (+ `_specification`: win, gap, group; edge_score -> verdict via the Product Evaluation
thresholds), `serving.competitive_product` (category; the rival list shows products in the client's categories plus any
with a stored comparison), `serving.competitive_geo_analysis`.

Data gaps that leave parts of the reference layout empty (DB/prompt side, **not implemented**):
1. `competitive_geo_company_presence.matched_ranges` is empty on almost every row, so "Overlapping categories" falls back
   to the categories of the stored comparisons with that rival (or "—"); the "meets <client> in …" line never shows.
2. `competitive_matchup.edge_score` is NULL on 21 of 43 local pairs -> pill "Not decided: no stored verdict" and those
   pairs do not count in "Datasheet outcome".
3. `competitive_matchup_specification.win` is set on 34 of 469 spec rows and `gap` is mostly NULL -> few ▲ marks,
   empty Gap column and no "<side> is ahead on" lines.
4. No per-matchup datasheet/source link is shipped (the reference prints "<rival> datasheet ↗ · <client> datasheet ↗"
   under each comparison) -> would need the matchup's source URLs (e.g. a `competitive_matchup_source` table or the two
   products' source_url) added to the matchup payload.
5. The reference product row carries a class line (rating band · rating · frequency · type); `competitive_product` only
   has `category`, so the row shows the category. A stored product class / key-rating column would fill it.
6. Presence words are the stored activity (Local production / Licensed production / Export / Sales and service /
   Sourcing); the reference's "builds here / exports in / partner" are not mapped.

## 2026-10-17 · Market > Global Requirements: OPPORTUNITY tag, WATCH pill, Key points

Frontend: every stored requirement card (`req-<requirement_id>`) carries the lane kind `requirement` (`src/lib/dataset.js`),
so its row shows the yellow "OPPORTUNITY" tag (`marketLane().tagWord`, `.dirtag.k-requirement`) and its detail panel the
"WATCH" pill (`marketLane().panelStance`); the panel's "Key points" shows the stored strategic assessment when the
record has no article statements (`src/components/detailPanel/DetailPanel.jsx`).

DB impact: **no table change required.** Key points read `serving.market_global_requirement.strategic_assessment`
(already shipped as the detail's `why`). Notes, **not implemented**:
1. The WATCH pill and the OPPORTUNITY tag are the lane's words (every global requirement is a perceived opportunity on
   watch, as in the reference); `market_global_requirement` has **no stance column**. If requirements ever need their
   own stance (threat / watch per row), add one (e.g. `market_global_requirement.direction` with the threat|watch check)
   and have `requirement_assessment`/the prompt fill it; the panel would then read it instead of the lane word.
2. The reference's key points are 1-4 bullets; the stored assessment is one paragraph, shown as one bullet. A stored
   bullet list (e.g. a `market_global_requirement_point` child table, or an array column) would give separate bullets.

## 2026-10-17 · Market > Tenders: Matched products and Competitor fit

Frontend (`src/pages/market/Tenders.jsx`, `src/styles/tender.css`): both sections already existed and render whenever
the tender carries the rows. Fixed how the stored rows print:
- a matched product's pill shows the stored percentage, else the stored fit word ("partial fit"), else "— fit"
  (it printed a bare " fit" because `fit_percent` is empty on most rows)
- a stored match line is `[label, value]` (`market_tender_product_match_line`); it printed a ▼ and dropped the label.
  It now prints "• Label: value"; an arrow only for a reference-style `[up|down, text]` line
- the rival's fit pill is readable (it was white on white) and reads "<word> fit"

DB impact: **no table change required.** Data gaps (DB/prompt side, **not implemented**):
1. Coverage: of 292 open/closing tenders in local staging only 87 have a `market_tender_product_match` row and 53 a
   `market_tender_competitor_fit` row (132 have a `market_tender_fit_assessment`). Every other tender shows neither
   section -- `tender_assessment` needs to run on the live tenders.
2. `market_tender_product_match` has no rationale column; the reference card carries a one-line reason under each matched
   product. 422 of 607 matches also have no `_line` rows, so they show only the product and the fit. A
   `match_rationale text` column (filled by the prompt) would give every card its reason line.
3. `fit_percent` is set on 69 of 607 matches; the pill falls back to the fit word.

## 2026-10-17 · Technology: ADOPTABLE / stage pill / "<client> behind" labels

Checked against the reference: ADOPTABLE (Technology overview) and the "<client> behind / at parity / ahead" pill
(Innovations) were already wired. Frontend change: the Innovations row pill now prints the short stage word of the
stored maturity code (`technology_innovation.maturity` -> LAB / IN DEVELOPMENT / IN PRODUCTION / FIELDED / IN SERVICE,
words in `src/lib/innovation.js` MAT_LAB) as the reference does; the stored sentence
(`technology_innovation_status.maturity_label`) moved to the pill's tooltip and stays in the detail panel.

DB impact: **no table change required.** Data gaps (**not implemented**):
1. Position: 14 of 15 local innovations store gap `unknown` and no `position_label`, so only one row carries a
   "KSSL behind" pill. The prompt (`innovation_detail`) has to assess the client position for each innovation.
2. "IN PRODUCTION" appears only for maturity code `prod`; no local innovation has it today (12 dev, 2 fielded, 1 lab).
3. Coverage: the 15 innovations sit in 3 of 10 domains (Protected & Armoured Vehicles, UAVs & Drones, Missiles & Air
   Defence); the other tabs (Artillery first) are empty until `innovation_discovery` fills them.

## 2026-10-17 · Layout fixes, rupee display, revenue-tier filter

Frontend only: profile news cards line up (fixed 3-line headline, one-line meta/source; the news list's category chip
no longer overruns the source column); Partnership's expand button sits clear of the header line; the Top opportunity,
Market outlook, Awarded/Active/Closed and By-category tables use fixed column widths with wrapped, 3-line-clamped
text; the Market Intelligence category filter is plain text (no category colours); the "Data: …" footers under the
Market Intelligence tables are removed; stored codes such as `need_stated` read as words; a long metric value
steps down a size and clamps to two lines; the Competitor Profile always shows the revenue-tier filter under the
origin filter.

DB impact / gaps (**not implemented**):
1. **Indian rupees.** Value totals are now formatted in rupees, Indian style (`₹ 472 Cr`, `₹ 8.5 L`, see
   `src/lib/tenderValue.js`). An INR amount is shown directly; any other currency is converted **only with a stored
   exchange rate**, read from the dataset key `fxRates` (`{ "USD": <rupees per unit>, … }`). No rate exists in the DB
   today, so non-INR amounts still show in their own currency. To switch everything to rupees: add a rates table
   (e.g. `serving.fx_rate (currency_code char(3) primary key, inr_per_unit numeric not null, as_of_date date not null,
   source_url text)`) and have the backend ship it as `fxRates`. No rate is written in code.
2. The Top opportunity "Tender value" tile prints the stored `market_top_opportunity_metric.formatted_value` text
   ("UAH 2.41 bn · CZK …"), which the frontend cannot convert. The `top_opportunity` lane should write this metric in
   INR (formatted_value in ₹ Cr, amount_value in rupees, currency_code `INR`) once rates exist.
3. Revenue tier: no competitor carries a revenue tier in local staging (`competitive_competitor.revenue_filter` empty),
   so the filter shows "No revenue tier on record yet" until the competitor prompt / Excel load fills it.
4. `market_tender` / `market_award` stage codes (`need_stated`, `approved_funded`, `rfi`) are displayed as words; a
   stored label column would let the wording be edited without code.
