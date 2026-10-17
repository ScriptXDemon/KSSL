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
