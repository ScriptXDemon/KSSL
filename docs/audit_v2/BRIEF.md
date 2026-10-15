# Brief for every agent working on KSSL v2

Repo: `C:\Users\HARICHANDRA\Desktop\KSSL\kssl_local`, git branch `v2` (do NOT switch branches, do NOT commit, do NOT push; the coordinator commits). Windows; use Git Bash syntax in Bash. Python 3.11, Node 25.

## The product
A React 18 + Vite dashboard (src/) fed by one FastAPI endpoint `GET /api/dataset` (backend/app.py), which reads PostgreSQL schemas `ui` (page config, 62 tables) and `serving` (data, 89 tables). Schema: `kssl_schema_from_docx.sql`; every table + column (`*` = NOT NULL) is listed in `docs/audit_v2/schema_v2_columns.txt`. Almost no primary/foreign keys exist; relationships are by `*_id` naming.

## The rules (the user's, non-negotiable)
1. Every value shown on the UI comes from a DB column (ui or serving schema), or is computed from DB values by a stated rule. Nothing is defaulted, invented, or written as content in code.
2. UI "chrome" is allowed in code: headings, button labels, filter labels, empty-state wording ("No products on record"), tooltips that explain the UI. Content about companies, products, people, programmes, markets, numbers or judgements is NOT allowed in code.
3. A field with no column is hidden (not filled from something else), and listed for the user to decide "add column or keep hidden".
4. Hidden by decision (re-confirmed by the user 2026-10-16): Stock (removed), Product images, SWOT, the Strategic Positioning paragraph, Parallax Read, and the Gap Analysis page (archived: off the rail AND not reachable by URL, so its written essays never show). Columns may exist; do not show them; no clean-up effort is spent inside hidden features beyond making them unreachable.
5. Live Google News headlines on the Profile/Products pages (`/api/pulse`, vite.config.js) stay by decision - they are the one live, non-DB element.
6. Writes never go to `ui`/`serving` directly: data is inserted into `staging`/`staging_ui` (same tables) and reaches the live schemas only via Approve in the review copy (db/migrations/001_staging.sql). Live tables refuse direct INSERT/UPDATE/DELETE unless `SET LOCAL kssl.approve = 'on'`.
7. Future data sources: competitor company details, leadership, competitor products + specs, and client (KSSL) data come from the client's Excel files. Everything else (signals, evaluations, partnerships, projects, geo, tenders, opportunities, innovations, tech articles, competitor moments...) comes from Claude prompts. News comes from the news job.

## Database (local Docker)
`docker exec kssl-pg psql -U kssl -d kssl_frontend -c "..."` (Git Bash: prefix `MSYS_NO_PATHCONV=1` when passing file paths). DSN for Python: `host=127.0.0.1 port=55432 dbname=kssl_frontend user=kssl password=kssl`. Schemas: ui, serving (live), staging_ui, staging (review). Old schema backups v1_* - ignore them. Read-only unless your task says otherwise.

## Running
Backend: `KSSL_DSN="host=127.0.0.1 port=55432 dbname=kssl_frontend user=kssl password=kssl" python -m uvicorn backend.app:app --host 127.0.0.1 --port 8600` (one is already running on 8600 - do not start another on 8600; use another port if you need your own). Frontend dev server already runs on http://localhost:5178. Playwright is installed in node_modules (`import { chromium } from "file:///C:/Users/HARICHANDRA/Desktop/KSSL/kssl_local/node_modules/playwright/index.mjs"`).

## Style
Match the surrounding code. Small diffs. No new dependencies. Comments only where the code is non-obvious. Never print secrets. Put scratch files outside the repo (use $TEMP).
