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
| Rail words read "Partnerships", "Patents", "Global requirements", "Overview / Innovations" (technology) where the reference says "Partnership", "Patent", "Global Requirements", "Overview / Innovations" | the stored navigation labels (`ui.competitive_navigation`, `ui.market_view`, `ui.technology_ui_view`); the reference has them as literals |
| Rail count badges differ (9/5/30/15/5/5/10/14/14, 9/7/6/11, 10/16 vs 18/8/32/91/7/8/58/3/37, ...) | seed (counts are derived from the rows served) |

## Per route

### competitive / overview
| Difference | Reason |
|---|---|
| The strip shows three tiles (Competitors tracked, Competitive threats, Watch signals) in the first three slots, the rest empty; the reference has four (Competitive threats, Watch signals, Companies tracked, Rating matched pairs) | the tile words are the stored `ui.competitive_metric` labels bound by `metric_key`; "Rating matched pairs" was never measured in the reference either (it printed "not wired") and has no stored row |
| Pills ALL / THREAT / WATCH with counts, heading "COMPETITIVE INTELLIGENCE", threat / watch badges and their colours match the reference | was UNEXPECTED U1, resolved in fix round 1: pills are `ui.filter_option` group `stance`; the heading is chrome (no table holds it); badges use the stored badge word |
| Card dates read "11 Oct 2026" | fixed earlier (stored ISO dates are written in the house format) |
| Card text, order and counts | seed and R5 (stored sequence) |

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
| Subtitle "0 graded a threat" and pills read raw "HIGH" / lower-case | was UNEXPECTED, fixed: the word, tag class and threat count come from `ui.competitive_competitor_moment_level`. Now "5 graded a threat", pills "HIGH THREAT" and "WATCH". The third stored level (opportunity) draws no pill, as the reference's third level drew none (its word was empty) |
| The time-window chips are the stored windows ("Last 30 days" / "Last 90 days" / "Last 12 months") plus the "All" reset, not Today / Week / Month | `ui.competitive_competitor_moment_time_window` (fix round 1) |
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
| Rail reads Top opportunity / Tenders / Global requirements / Market Intelligence (sentence case "requirements") and the tiles read the stored words | `ui.market_view` (rail_label, rail_order) and `ui.market_top_opportunity_view`; the seed orders match the reference |
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
| Heading "Technology Overview", tiles "Competitor advances / Adoptable technologies / Innovations tracked" (innovations counted, not domains), rail "Overview / Innovations", sequence menu "Newest first / Oldest first / Threat first", search placeholder "Search signals..." | the stored words: `ui.technology_ui_view`, `serving.technology_metric` (bound by metric_key). The reference says "Technology Knowledge", "Adoptable advances", "Domains tracked", "Priority (threats first)" from literals in its code |
| Competitor-advance rows carry no badge, adoptable rows carry the green ADOPTABLE badge (as in the reference) | `ui.filter_option` group `technology-feed` (badge_label null for the first) |
| Layout, cards and tabs match; the innovation tabs are the seed's six categories | seed |

## UNEXPECTED differences

Resolved in fix round 1: U1 (the Competitive overview had no strip, no pills and the heading "SIGNALS": it is now built from `ui.competitive_metric` and `ui.filter_option`, see "Label sources"). Fixed earlier by the visual comparison: ISO dates printed on signal cards; the Moment page ignored the stored levels; the patent "Data source" note had a hardcoded provider list (now only stored sources, no default prose).

Still open:
- U3 (minor): the Patent rail has no client entry. `compOrder` holds rivals only; the reference lists the client with 0 filings.
- U4: the labels listed as NOT WIRED under "Label sources" are still literals in code although MAPPING E maps them to a ui table.

## Label sources

What the screens' words are made of, so a hardcoded word that looks identical to the reference is not mistaken for data.

Wired to the database (read with `src/lib/uiText.js`, covered by `test_ui_labels.mjs` and e2e FE-006 / FE-022): competitive overview tiles (`ui.competitive_metric`); stance pills, badge words and the stance words in the detail panel and Projects (`ui.filter_option` group `stance`); technology tiles (`serving.technology_metric`); technology pills, groups and badge (`ui.filter_option` group `technology-feed`); technology heading, sequence menu, sequence label and search placeholder (`ui.technology_ui_view`); market top-opportunity tiles and heading (`ui.market_top_opportunity_view`); market feed pills, groups and badges (`ui.filter_option` group `market-feed`); market report tiles (`ui.market_metric`); the rail labels, rail order and page headings of all three pillars (`ui.competitive_navigation`, `ui.market_view`, `ui.technology_ui_view`); Market Intelligence tabs (`ui.market_intelligence_tab`); the Moment time-window chips and the Profile news windows (`ui.competitive_competitor_moment_time_window`); Moment level words (`ui.competitive_competitor_moment_level`); Projects filters and sequence (`ui.ui_project_*` through `projectsConfig`). A row, label or table that is missing draws nothing (no tile, no pill, no tab, no rail item); there is no default set.

Data, not labels: the options of every country, category, revenue-tier, origin and company filter are the distinct stored values of the rows on screen. The only literal in those controls is the reset word "All".

Chrome by decision (MAPPING E5): the competitive overview heading "Competitive Intelligence"; the sequence menus and search placeholder of the competitive and market overviews; the reset pills "All" / "All time" / "All dates"; archived and hidden view titles (Finances, Gap Analysis, Awarded and Closed Tenders); block titles, column headers, parameter labels, call-to-action words.

NOT WIRED (U4; MAPPING E maps them to a ui table but the code still carries the literal): the Tenders and Global Requirements filter labels and sort notes (`ui.market_tenders_view`, `ui.market_global_requirement_*`), the empty-state texts (`ui.market_view.empty_state_text`), the Top-opportunity section titles and notes (`ui.market_top_opportunity_view.*_section_label`), the Product Evaluation tab labels (`ui.competitive_positioning_tab`), the pillar names Market and Technology (`ui.market_pillar.display_name`, `ui.technology_pillar.pillar_name`), the impact eyebrows (`competitive_signal_detail.impact_eyebrow`).

New table this round: `ui.filter_option(filter_group, option_code, option_label, badge_label, display_order)` (staging_ui + ui, guard trigger, seeded). It is meant to be filled by the prompts. Its groups: `stance` (threat, watch), `market-feed` (tenders, opportunities), `technology-feed` (competitor-advances, adoptable).

## Cummins hide rules preserved

The reference source (read only) was audited for every place it deliberately hides something. The user rule: what the Cummins UI hides stays hidden, stated without hardcoded values. The file:line references are into the Cummins `frontend/src` tree.

| Cummins hide rule (file:line) | Where and how the port keeps it |
|---|---|
| `lib/dataset.js:344-347` the competitive overview drops the third stance's filter and its cards | `src/lib/lanes.js` builds the pills from the stored stance rows (threat and watch only); `src/lib/dataset.js` marks a card whose stored stance is neither as `noStance` and leaves it off the competitive overview; no stance is kept anywhere (`uiText.stanceOf`). `test_threat_logic.mjs`, `test_ui_labels.mjs` |
| `pages/overview/Overview.jsx:86` no third-stance badge anywhere; `pages/competitive/ThreatAnalysis.jsx:21` its Moment level word is empty, so it draws no pill | no third stance in `src` (a test greps for it); the Moment page draws a word and pill only when the stored level's tag is a stance (`ThreatAnalysis.jsx levelWord`) |
| `pages/competitive/Profile.jsx:791`, `Products.jsx:1376`, `Projects.jsx:156`, `ThreatAnalysis.jsx:124` the dot colour falls back to watch for any other value | the dot is drawn only for a stored threat or watch; any other value draws no dot (no stance is invented) |
| `lib/geo.js:47`, `pages/competitive/Geo.jsx:695` the client's own marker reuses the third-stance class | class `client` (`geo.css .pk-dot.client`, `.geo-d-h.dir-client`); no stance word |
| `lib/overview.js:694` the third-stance tile predicate | removed with the stance (`overview.js tilePredicate`); `TILE_LABELS` has no such entry (`test_feed_state.mjs`) |
| `lib/dataset.js:371` only ADOPTABLE is labelled on a technology row | `lanes.js technologyLane`: the stored badge word of each option; the competitor-advance option has none, so no badge |
| `lib/dataset.js:373`, `:696` the All / Competitor / Adoptable and All / Latest Tenders / Perceived Opportunities buttons are off on those pillars; `:714` and `Overview.jsx:382` the group banner is off | `hideFilterButtons: true` on both lanes (`dataset.js`); `Overview.jsx` renders no group banner; the pills stay in the config for the tiles and the count line |
| `lib/dataset.js:690` the TENDER badge reads green | kind `tender` gives `.dirtag.k-tender` (`shell.css`) |
| `components/metricsStrip/MetricsStrip.jsx:82,113,125` two slots empty, no tile dot, no descriptive subline (the warning subline stays) | the unused slots are empty cells (`lanes.js withBlanks`, `MetricsStrip` `blank`); dot and subline code unchanged |
| `components/sidebar/Sidebar.jsx:28,33` no overview glyph, no rail marker | `Sidebar.jsx` unchanged in that part |
| `components/signalCard/SignalCard.jsx:49` the HIGH / MEDIUM / LOW badge is off | not rendered; severity is a judgement the port no longer carries (R5) |
| `components/subHead/SubHead.jsx:13,93,102` Copy Summary, Export JSON and the on-screen count line are off | `SubHead.jsx` and `chrome.css` unchanged |
| `components/topBar/TopBar.jsx:204` the Feed / Live box is off | `TopBar.jsx` unchanged |
| `lib/route.js:22,54`, `components/layout/Layout.jsx:193,209` archived views are off the rail but still routed | `route.js ARCHIVED_VIEWS`; Layout still renders them |
| `lib/overview.js:19` the depth and category sequences are off the menu | `SEQ_OPTIONS` lists priority and recency only (`seqMode` still accepts the rest) |
| `lib/specs.js:114` no sources on the Spec Comparison | `SHOW_POSITIONING_SOURCES = false`; `test_positioning_sources.mjs` holds all three panels source-free |
| `components/detailPanel/DetailPanel.jsx:72-93` the facts "stance", "date", "publisher", "primary lens" and unresolved tender rows are dropped; `:179,254` quote marks off | `DetailPanel.jsx` unchanged in that part |
| `pages/market/Tenders.jsx:448` the card grid shows five parameters; the rest live in the panel | `DASHBOARD_PARAM_KEYS` unchanged |
| `lib/partners.js:2266` the partner card is name, relationship and detail link only | unchanged |
| `pages/overview/Overview.jsx:328,350` no group straplines, no "30 of 82 ... served" line | not rendered |
| `pages/competitive/Positioning.jsx:238` the competitor product name is a plain label; `Partnerships.jsx:57` a company opens with its branches spread | unchanged |
| `styles/*.css` every `display:none` rule (`.alert .sig`, `.srcbadge`, `.cp-note`, `.pg-graph-foot`, `.pg-legend-title`, `.view`, ...) | the style files carry the same rules (counted per file against the reference) |
| `pages/competitive/Geo.jsx:299-301` a dealer branch or depot is not listed as a product | gone: the rule matched genset product names ("tracked range", "diesel and gas gensets") in the Cummins data, so it was deleted with them |
| `lib/dataset.js:160-167` threat routing strict by operator choice | a pipeline rule, not a UI hide: the port reads the stored stance |

## Empty-dataset check (Review Focus 1)

`bash db/make_test_pair.sh` without `--approve-all`, :8610 restarted (serving empty: 0 competitors, 0 cards, 0 tenders, empty `sectionVisibility`), then `KSSL_EMPTY=1 npx playwright test -g "empty dataset"`: all 15 routes render, no ErrorBoundary panel, no `undefined`, `NaN`, `[object Object]`, `null`, "cummins" or "genset" in the visible text. The pair was then rebuilt with `--approve-all`.
