# Visual verification against the Cummins reference

How it was done. Every route of the rail (`src/lib/route.js` RAIL, 15 routes) was opened at 1440x900 in Chromium on

- KSSL: the live build, `http://127.0.0.1:5190`, backend `:8610` on `kssl_test_serving` (the fictional seed, built with `bash db/make_test_pair.sh --approve-all`), and
- the reference: `http://187.127.134.12:8101` (the Cummins demo, same code as the source app).

Screenshots are in `docs/ui_port/screens/`: `kssl-<pillar>-<view>.png` and `ref-<pillar>-<view>.png`, 15 pairs (30 files). The visible text of every page was also diffed label by label. The reference was reachable, so this is a real two-sided comparison (the reference logs five `save answered 404` page errors of its own; KSSL logs none).

Each row below gives the difference and its reason. Codes: **hidden** = hidden by design (`ui.section_visibility`, all eight keys `false`); **genset** = genset feature removed by design; **R5** = feed order is the stored sequence, no browser re-ranking; **R8** = Cummins-v2-only feature dropped; **R9** = values per currency, never converted; **R19** = stock UI removed; **seed** = the test seed holds no such data, or different data; **UNEXPECTED** = not explained by a decision; needs a follow-up.

Layout, navigation, tab strips, filter bars, card anatomy, graph, map, and tables match on every route. What differs is below.

## Differences on every route

| Difference | Reason |
|---|---|
| "ASK PARALLAX" button bottom left is absent | hidden (`chat`) |
| Top-right client chip reads "Aurora (TEST)" instead of "Cummins Arabia"; names, products, countries, numbers and rail counts differ | seed (client and data come from the database) |
| Rail count badges differ (9/5/30/15/5/5/10/14/14, 9/7/6/11, 10/16 vs 18/8/32/91/7/8/58/3/37, ...) | seed (counts are derived from the rows served) |

## Per route

### competitive / overview
| Difference | Reason |
|---|---|
| The four-tile metric strip (Competitive threats, Watch signals, Companies tracked, Rating matched pairs) is absent | UNEXPECTED, see U1 |
| The direction filter pills (ALL 18 / THREAT 6 / WATCH 12) beside Search are absent | UNEXPECTED, see U1 |
| The list heading reads "SIGNALS" instead of "COMPETITIVE INTELLIGENCE" | UNEXPECTED, see U1 |
| Card dates read "11 Oct 2026" (fixed in this task; they printed the stored ISO "2026-10-11") | was UNEXPECTED, fixed in `signalDate()` |
| Reference card text ends with an "Action: ..." sentence | seed (that sentence is part of the stored Cummins card text; the seed cards carry their own stored sentence) |
| Order and content of the cards | R5 (stored sequence) and seed |

### competitive / profile
| Difference | Reason |
|---|---|
| "STRATEGIC POSITIONING" and "PARALLAX READ" blocks, and "STRENGTHS / WEAKNESSES" are absent | hidden (`strategic-positioning`, `parallax-read`, `swot`) |
| "COMPANY STOCKS / STOCK · CATERP.NS" block is absent | R19 |
| Revenue shows an em dash, leadership reads "No executive officers published on public record", company size is a number | seed (those fields are empty in the seed; empty states are the component's own) |
| News thumbnails are blank tiles | seed (no article images stored) |

### competitive / threat-analysis (Competitor Moment)
| Difference | Reason |
|---|---|
| Subtitle "0 graded a threat" and pills read raw "HIGH" / lower-case | was UNEXPECTED, fixed in this task: the Moment page compared the codes THREAT / WATCH / FAV, but the stored levels are high / watch / opportunity. It now reads the word, tag class and threat count from `ui.competitive_competitor_moment_level`. After the fix: "5 graded a threat", pills "HIGH THREAT / WATCH / OPPORTUNITY" |
| Cards carry a source tile (e.g. "PLACEHOLDER BUSINESS JOURNAL") and category chips, not photos | seed (no images) |
| Cards are ordered by date, newest first | R5 |

### competitive / products
| Difference | Reason |
|---|---|
| No STANDBY / PRIME / ENGINE / FUEL spec tiles, no "DATA-CENTRE RATED" tag, groups are product categories (Artillery, Ammunition) not Diesel / Gas Genset | genset |
| Product tiles have no photo | hidden (`product-images`) and seed |
| Cards per row (2 vs 3) | seed (2 products in the category) |

### competitive / positioning (Product Evaluation)
| Difference | Reason |
|---|---|
| Groups are product categories, not "MID RANGE (500 TO 1,000 KVA)" / "HIGH HORSEPOWER (1,001 TO 2,000 KVA)" | genset (kVA bands) |
| Compare control, filters, rows and "N rivals" counters match | none |

### competitive / partnerships
| Difference | Reason |
|---|---|
| Graph nodes all use warm yellows and one glyph; the reference has distinct colours and icons | seed (the colour is the palette entry at the category's display order in `ui.partner_category`; the seed's three categories are adjacent entries) |
| The review-only synthesis and field-level lists | review mode only; none in the live build |

### competitive / projects
| Difference | Reason |
|---|---|
| The "IN THE GULF REGION" tile is gone and the "GULF REGION / WORLDWIDE" filter reads "DOMESTIC / EXPORT" | genset (Gulf branch removed); the filter words are `ui.project_filter` rows |
| Sequence menu has no "Largest (MW)" and no "Undated" option; reads "Most recent milestone" | genset (MW sort) and `ui.project_sequence_option` (seed words) |
| Project stage words (TRIALS, CONTRACT, CONCEPT, PRODUCTION) differ from COMMITTED / IN PROGRESS / DELIVERED | seed (stored stages) |

### competitive / geo
| Difference | Reason |
|---|---|
| Dots for rival countries as well as the client's | seed (the seed has footprints in 14 countries; the reference has three Gulf rows) |

### competitive / patents-comp
| Difference | Reason |
|---|---|
| The rail has no entry for the client (the reference lists "Cummins Arabia 0" first) | UNEXPECTED (minor): `compOrder` from the KSSL backend holds rivals only, the client is not a competitor row; the reference lists the client with 0 filings |
| The "Data source" note names the stored source note of the filings, not "EPO, Google Patents, Lens.org" | was UNEXPECTED, fixed in this task: `patApiNote` fell back to a hardcoded provider list when the dataset named none. It now names only what the dataset stores |
| "All product categories" menu and filing cards (priority, status, classification) | seed (the reference shows its empty state) |

### market / m-overview (Top opportunity)
| Difference | Reason |
|---|---|
| Fit words read STRONG / PARTIAL, not GOOD / PARTIAL | R7 (KSSL vocabulary strong / partial / weak) |
| "Decides" shows the stored text ("Award expected in Q1 2027"), not a date | seed (stored text) |
| Revenue column and subtitle read "revenue is the analyst estimate" and the "ranked by revenue the client can win x how well a model fits" sentence is gone; the "no genset tender yet" subtitle is neutral | genset / R18 (no claim wording) |
| Tender value tile "EUR 9 m . USD 1,201 m"; "Perceived opportunities 0" | R9 (per currency); seed |

### market / tender
| Difference | Reason |
|---|---|
| Value cells "EUR 9 million" per currency; "VALUE DISCLOSED EUR 9 m . USD 1,678 m" | R9 |
| Fit bar shows a percentage (56%), not a tier word | seed (stored `pct`; the reference rows carry tier words) |
| No "date not published" / "not disclosed" cells | seed (every seed tender has a date and a value) |

### market / global-requirement
| Difference | Reason |
|---|---|
| Cards have no OPPORTUNITY badge; the top-right shows the stored stage text ("Request for proposals Q2 2027") instead of a date | no stored stance column on requirement cards, so no stance badge (rule: no default); the stage text is a stored field |

### market / m-report (Market Intelligence)
| Difference | Reason |
|---|---|
| "What to do" shows the stored recommendation ("Watch: ...", "Prioritise: ...") instead of computed Pursue / Prioritise / Watch / Steady words | R5 (no browser judgement); text is `market_segment_assessment` |
| "Open tenders that fit" shows stated value per currency, not "est. revenue" | R9 |
| Winners table has no SHARE column; a "SIZES BUYERS NEED" section is absent | R9 (no share across currencies); genset (size bands) |
| Awards line totals "EUR 428.5 m . INR 9,200 m . USD 650 m" | R9 |
| The Awarded tab shows the Arabic-script buyer and "L&T (TEST)" literally | seed (special-name checks) |

### technology / t-overview, innovation
| Difference | Reason |
|---|---|
| Layout, tiles (Competitor advances, Adoptable advances, Domains tracked), tags and tabs match; domain tabs are the seed's six categories | seed |
| Card dates read "10 Oct 2026" after the date fix | was UNEXPECTED, fixed |

## UNEXPECTED differences still open

1. **U1: the Competitive overview has no metric strip, no direction filter pills, and the heading "SIGNALS".** `backend/areas/a_competitive.py` ships `overviewConfig.competitive` with `title: null, metrics: [], filters: []` (ruling R12: the backend sends no English labels), and the UI has no reader for the label tables that MAPPING E names (`ui.competitive_metric`, `ui.competitive_overview_feed`): `uiText()` was never built. The market and technology lanes still show their tiles because `src/lib/dataset.js` keeps their English labels as literals (those literals are themselves hardcoded labels; MAPPING E says they should come from `ui.market_metric` / `ui.technology_metric`). Fix: build the competitive lane's `metrics`, `filters` and `title` in `dataset.js` from `data.database.ui.competitive_metric` (label, `metric_key`) and bind `metricsFor` by `metric_key`, not by label string.
2. **U3 (minor): the Patent rail has no client entry** (see above). `compOrder` holds rivals only.

Fixed in this task, found by this comparison: a hardcoded default provider list in the patent "Data source" note (`patApiNote`); stored ISO dates printed raw on the signal cards (now "11 Oct 2026"); the Competitor Moment page's level words, pill class and threat count did not read the stored levels (now read `ui.competitive_competitor_moment_level`); the Profile list view printed the listing-page date for publisher-index rows (now the dash); two review lists on Partnership had Approve bars on rows the review API cannot approve alone (competitive_synthesis rides on the competitor card) and one list that could not be reached (field-level patterns).

## Empty-dataset check (Review Focus 1)

`bash db/make_test_pair.sh` without `--approve-all`, :8610 restarted (serving empty: 0 competitors, 0 cards, 0 tenders, empty `sectionVisibility`), then `KSSL_EMPTY=1 npx playwright test -g "empty dataset"`: all 15 routes render, no ErrorBoundary panel, no `undefined`, `NaN`, `[object Object]`, `null`, "cummins" or "genset" in the visible text. The pair was then rebuilt with `--approve-all`.
