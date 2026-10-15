"""Database-backed KSSL dataset API.

The browser cannot connect to PostgreSQL directly. This small API reads the two
schema namespaces, exposes every table under ``database`` for traceable access,
and adapts the domain tables into the contract consumed by the existing React UI.
An empty database therefore produces empty arrays and maps throughout the UI.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import os
import re
from typing import Any
from uuid import UUID

import psycopg2
import psycopg2.extras
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware


DSN = os.environ.get("KSSL_DSN", "").strip()

app = FastAPI(title="KSSL PostgreSQL Dataset API", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    if isinstance(value, dict):
        return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(v) for v in value]
    return value


def slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def text(value: Any) -> str:
    return "" if value is None else str(value)


def first_nonempty(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return None


def rows_by_id(rows: list[dict[str, Any]], *names: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        key = first_nonempty(row, *names) or f"row-{index + 1}"
        result[str(key)] = row
    return result


def connect():
    if not DSN:
        raise RuntimeError(
            "KSSL_DSN is not configured. Set it to the PostgreSQL connection string."
        )
    return psycopg2.connect(DSN, connect_timeout=5)


def load_all_tables() -> dict[str, dict[str, list[dict[str, Any]]]]:
    """Read every table in ui and serving without relying on a hardcoded table list."""
    database: dict[str, dict[str, list[dict[str, Any]]]] = {"ui": {}, "serving": {}}
    with connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema IN ('ui', 'serving')
                  AND table_type = 'BASE TABLE'
                ORDER BY table_schema, table_name
                """
            )
            tables = cur.fetchall()
            for table in tables:
                schema = table["table_schema"]
                name = table["table_name"]
                cur.execute(
                    'SELECT * FROM "{}"."{}"'.format(
                        schema.replace('"', '""'), name.replace('"', '""')
                    )
                )
                database[schema][name] = [
                    {key: json_value(value) for key, value in dict(row).items()}
                    for row in cur.fetchall()
                ]
    return database


def load_schema_manifest() -> dict[str, dict[str, list[dict[str, Any]]]]:
    """Return every table's column metadata, including when all tables are empty."""
    manifest: dict[str, dict[str, list[dict[str, Any]]]] = {"ui": {}, "serving": {}}
    with connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT table_schema, table_name, column_name, ordinal_position,
                       data_type, udt_name, is_nullable, character_maximum_length,
                       numeric_precision, numeric_scale
                FROM information_schema.columns
                WHERE table_schema IN ('ui', 'serving')
                ORDER BY table_schema, table_name, ordinal_position
                """
            )
            for row in cur.fetchall():
                schema = row["table_schema"]
                name = row["table_name"]
                manifest[schema].setdefault(name, []).append({
                    key: json_value(value)
                    for key, value in dict(row).items()
                    if key not in ("table_schema", "table_name")
                })
    return manifest


def table(database: dict[str, dict[str, list[dict[str, Any]]]], schema: str, name: str) -> list[dict[str, Any]]:
    return database.get(schema, {}).get(name, [])


def build_competitors(database):
    result = {}
    order = []
    for row in table(database, "serving", "competitive_competitor"):
        cid = text(first_nonempty(row, "competitor_id", "company_id")) or slug(
            first_nonempty(row, "display_name", "legal_name")
        )
        if not cid:
            continue
        result[cid] = {
            "id": cid,
            "cid": cid,
            "name": text(first_nonempty(row, "display_name", "legal_name")),
            "short": text(row.get("short_name")),
            "threat": text(row.get("threat_level")),
            "origin": text(row.get("origin_country")),
            "sector": text(row.get("industry_sector")),
            "description": text(row.get("parallax_read")),
            "hq": text(row.get("headquarters")),
            "starting_year": row.get("starting_year"),
            "global_locations": row.get("global_locations"),
            "company_size": row.get("employee_count"),
            "sales": row.get("annual_revenue"),
            "partners": [],
            "products": [],
        }
        order.append(cid)
    return result, order


def build_signals(database, details):
    lanes = {"competitive": [], "market": [], "technology": []}
    for row in table(database, "serving", "competitive_signal"):
        signal_id = text(first_nonempty(row, "signal_id", "id"))
        if not signal_id:
            continue
        lane = text(row.get("classification")).lower()
        lane = "technology" if lane.startswith("tech") else "market" if lane.startswith("market") else "competitive"
        card = {
            "id": signal_id,
            "dir": text(row.get("classification")) or "watch",
            "rank": text(row.get("sequence_no")),
            "title": text(row.get("title")),
            "company": text(row.get("company_id")),
            "meta": text(row.get("category")),
            "ago": text(row.get("event_date")),
            "tags": text(row.get("category")),
            "lens": lane.title(),
            "sec": [],
            "url": text(row.get("source_url")),
            "sowhat": text(row.get("summary")),
        }
        lanes[lane].append(card)
    for row in table(database, "serving", "competitive_signal_detail"):
        signal_id = text(row.get("signal_id"))
        if signal_id:
            details[signal_id] = {
                "id": signal_id,
                "title": text(row.get("drawer_title")),
                "summary": text(row.get("why_it_matters")),
                "what": text(row.get("what_article_says")),
                "why": text(row.get("why_it_matters")),
                "lens": [],
                "url": text(row.get("source_url")),
            }
    return lanes


def build_competitor_moment(database):
    competitors = []
    for row in table(database, "serving", "competitive_competitor"):
        cid = text(first_nonempty(row, "competitor_id", "company_id"))
        if cid:
            competitors.append({
                "cid": cid,
                "name": text(first_nonempty(row, "display_name", "legal_name")),
                "short": text(row.get("short_name")),
                "threat": text(row.get("threat_level")),
            })
    items = []
    for row in table(database, "serving", "competitive_competitor_moment"):
        items.append({
            "id": text(first_nonempty(row, "moment_id", "id")),
            "cid": text(row.get("competitor_id")),
            "company": text(row.get("company_display")),
            "date": text(row.get("movement_date")),
            "category": text(row.get("category")),
            "country": text(first_nonempty(row, "country_name", "countries")),
            "program": text(row.get("program_name")),
            "title": text(row.get("title")),
            "description": text(first_nonempty(row, "description", "what_happened")),
            "analysis": text(row.get("kssl_analysis")),
            "level": text(row.get("grade")),
            "source": text(first_nonempty(row, "source_label", "source_domain")),
        })
    windows = []
    for row in table(database, "ui", "competitive_competitor_moment_time_window"):
        windows.append({"id": text(row.get("time_window_code")), "label": text(row.get("time_window_label")), "days": row.get("day_count")})
    levels = {}
    for row in table(database, "ui", "competitive_competitor_moment_level"):
        code = text(row.get("level_code"))
        if code:
            levels[code] = {"label": text(row.get("level_label")), "tagClass": text(row.get("tag_class"))}
    return {"competitors": competitors, "items": items, "timeWindows": windows, "levels": levels}


def build_projects(database, competitors):
    projects = []
    for row in table(database, "serving", "competitive_project"):
        pid = text(first_nonempty(row, "project_id", "id"))
        if not pid:
            continue
        projects.append({
            "id": pid,
            "cid": text(row.get("competitor_id")),
            "company": text(row.get("company_display")) or text(competitors.get(text(row.get("competitor_id")), {}).get("name")),
            "name": text(row.get("project_title")),
            "customer": text(row.get("customer")),
            "location": text(row.get("location")),
            "kind": text(row.get("kind")),
            "region": text(row.get("region")),
            "stage": text(row.get("stage")),
            "stageNote": text(row.get("stage_note")),
            "mw": row.get("estimated_value"),
            "latest": {"date": text(row.get("latest_milestone_date")), "note": text(row.get("latest_milestone"))},
            "assessment": {"stance": text(row.get("assessment_stance")), "read": text(row.get("assessment_read"))},
            "ksslPlatform": text(row.get("kssl_platform")),
            "ksslAdvantage": text(row.get("kssl_advantage")),
            "overview": [],
            "specs": [],
        })
    filters = [{"f": "all", "l": "All"}]
    for row in table(database, "ui", "ui_project_filter"):
        code = text(first_nonempty(row, "filter_code", "filter_id"))
        if code and code != "all":
            filters.append({"f": code, "l": text(row.get("filter_label"))})
    seq = []
    for row in table(database, "ui", "ui_project_sequence_option"):
        if row.get("sequence_code"):
            seq.append([text(row.get("sequence_code")), text(row.get("sequence_label"))])
    stages = [text(r.get("stage_name")) for r in table(database, "ui", "ui_project_stage_step") if r.get("stage_name")]
    competitor_rows = [competitors[cid] for cid in sorted({p["cid"] for p in projects if p.get("cid")}) if cid in competitors]
    return projects, {"competitors": competitor_rows, "filters": filters, "seqOptions": seq, "stageSteps": stages}


def build_geo(database):
    locations = rows_by_id(table(database, "serving", "competitive_geo_location"), "location_id")
    products = defaultdict(list)
    for row in table(database, "serving", "competitive_geo_product"):
        products[text(row.get("presence_id"))].append(row)
    geo = defaultdict(lambda: defaultdict(list))
    geo_comps = []
    for row in table(database, "serving", "competitive_geo_company_presence"):
        company_id = text(first_nonempty(row, "competitor_id", "client_id")) or "KSSL"
        loc = locations.get(text(row.get("location_id")), {})
        country = text(first_nonempty(loc, "country_name", "map_label"))
        if not country:
            continue
        records = products.get(text(row.get("presence_id")), [])
        if not records:
            records = [{}]
        for product in records:
            geo[company_id][country].append({
                "name": text(product.get("product_name")),
                "c": text(row.get("activity_type")),
                "stage": text(row.get("presence_status")),
                "since": text(product.get("since_date")),
                "note": text(product.get("record_note")),
                "src": text(row.get("relationship_text")),
            })
        if company_id not in {c.get("id") for c in geo_comps}:
            geo_comps.append({"id": company_id, "name": text(row.get("company_name")) or company_id, "isBf": row.get("company_role") == "client"})
    countries = sorted({country for by_country in geo.values() for country in by_country})
    return {k: {country: rows for country, rows in v.items()} for k, v in geo.items()}, geo_comps, countries


def build_tenders(database):
    tenders = []
    for row in table(database, "serving", "market_tender"):
        tid = text(first_nonempty(row, "tender_id", "tender_number"))
        if not tid:
            continue
        tenders.append({
            "id": tid,
            "title": text(first_nonempty(row, "title", "title_localized")),
            "issuer": text(first_nonempty(row, "issuer_display", "buyer_name")),
            "country": text(row.get("country_name")),
            "cat": text(first_nonempty(row, "category_text", "category_id")),
            "description": text(row.get("description")),
            "closingDate": text(row.get("closing_date")),
            "deadline": text(row.get("deadline_text")),
            "dl": row.get("days_remaining"),
            "isLive": row.get("is_live"),
            "value": text(row.get("value_text")),
            "expectedRevenue": text(row.get("expected_revenue_text")),
            "lean": text(row.get("lean_code")),
            "leanTxt": text(row.get("lean_text")),
            "ksslFit": text(row.get("kssl_fit")),
            "ksslModel": text(row.get("kssl_model")),
            "rank": row.get("rank_position"),
            "url": text(row.get("source_url")),
            "urlKind": text(row.get("url_kind")),
            "status": text(row.get("status")),
        })
    return tenders


def build_requirements(database):
    result = []
    for row in table(database, "serving", "market_global_requirement"):
        rid = text(first_nonempty(row, "requirement_id", "id"))
        if not rid:
            continue
        specs = [
            [text(s.get("spec_label")), text(s.get("spec_value"))]
            for s in table(database, "serving", "market_global_requirement_specification")
            if text(s.get("requirement_id")) == rid
        ]
        result.append({
            "id": rid,
            "title": text(row.get("title")),
            "buyer": text(row.get("buyer_name")),
            "country": text(row.get("country_name")),
            "cat": text(row.get("category")),
            "value": text(row.get("value_text")),
            "dl": row.get("days_remaining"),
            "deadline": text(row.get("deadline")),
            "desc": text(row.get("description")),
            "ksslFit": text(row.get("kssl_fit")),
            "ksslModel": text(row.get("kssl_model")),
            "strategicAssessment": text(row.get("strategic_assessment")),
            "specs": specs,
        })
    return result


def build_innovations(database):
    grouped = defaultdict(list)
    for row in table(database, "serving", "technology_innovation"):
        item = {
            "id": text(first_nonempty(row, "innovation_id", "external_id")),
            "t": text(row.get("title")),
            "s": text(row.get("list_description")),
            "summary": text(row.get("summary")),
            "driver": text(row.get("client_position")),
            "impact": text(row.get("why_matters_to_kssl")),
            "compNote": text(row.get("competitive_note")),
            "status": text(first_nonempty(row, "list_status_label", "status")),
            "maturity": text(row.get("maturity")),
        }
        grouped[text(first_nonempty(row, "category_id", "pillar_id"))].append(item)
    return dict(grouped)


def build_technology_categories(database):
    rows = table(database, "ui", "technology_category") or table(database, "serving", "technology_category")
    cats = []
    meta = {}
    for row in rows:
        category_id = text(first_nonempty(row, "category_id", "category_code"))
        if not category_id:
            continue
        name = text(first_nonempty(row, "category_name", "canonical_name"))
        cats.append({"id": category_id, "name": name})
        meta[category_id] = {"area": name, "description": text(row.get("category_description"))}
    return cats, meta


def build_matchups(database):
    advantages: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"client": [], "competitor": []})
    for row in table(database, "serving", "competitive_matchup_advantage"):
        mid = text(row.get("matchup_id"))
        side = text(row.get("side")).lower()
        if mid and side in ("client", "kssl", "bf", "competitor", "rival", "comp"):
            key = "client" if side in ("client", "kssl", "bf") else "competitor"
            advantages[mid][key].append(text(row.get("advantage_text")))

    specs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in table(database, "serving", "competitive_matchup_specification"):
        mid = text(row.get("matchup_id"))
        if not mid:
            continue
        specs[mid].append({
            "l": text(row.get("spec_label")),
            "u": text(row.get("unit")),
            "cv": first_nonempty(row, "competitor_value_text", "competitor_value_numeric"),
            "kv": first_nonempty(row, "client_value_text", "client_value_numeric"),
            "hi": None,
            "gap": row.get("gap_value"),
            "win": text(row.get("better_side")),
        })

    matchups = {}
    categories = {}
    for row in table(database, "serving", "competitive_matchup"):
        mid = text(first_nonempty(row, "matchup_id", "evaluation_id"))
        if not mid:
            continue
        category = text(row.get("category_code"))
        category_key = slug(category) or "uncategorised"
        categories[category_key] = category
        adv = advantages.get(mid, {"client": [], "competitor": []})
        matchups[mid] = {
            "id": mid,
            "comp": text(row.get("competitor_name")) + (f" · {text(row.get('competitor_product_name'))}" if row.get("competitor_product_name") else ""),
            "bf": text(row.get("client_product_name")),
            "anchor": text(row.get("client_product_name")),
            "compBy": text(row.get("competitor_name")),
            "cat": category,
            "country": text(row.get("competitor_country")),
            "specs": sorted(specs.get(mid, []), key=lambda s: s.get("l", "")),
            "advBf": adv["client"],
            "advComp": adv["competitor"],
            "verdict": text(first_nonempty(row, "verdict_headline", "verdict")),
            "edge": row.get("edge_score"),
            "global": False,
        }
    pos_cats = [[key, label] for key, label in sorted(categories.items(), key=lambda item: item[1].lower())]
    return matchups, pos_cats, categories


def build_dataset(database):
    account_rows = table(database, "serving", "client_account")
    account = account_rows[0] if account_rows else {}
    client_id = text(account.get("client_id"))
    client_name = text(first_nonempty(account, "client_name", "legal_name", "brand_name"))
    client_short = text(first_nonempty(account, "brand_name", "client_name"))

    competitors, comp_order = build_competitors(database)
    details = {}
    lanes = build_signals(database, details)
    geo_data, geo_comps, geo_countries = build_geo(database)
    projects, projects_config = build_projects(database, competitors)
    tenders = build_tenders(database)
    requirements = build_requirements(database)
    innovations = build_innovations(database)
    tech_cats, tech_area_meta = build_technology_categories(database)
    matchups, pos_cats, cat_key = build_matchups(database)

    client = {"id": client_id, "name": client_name, "short": client_short}
    if client_id and client_id not in competitors:
        competitors[client_id] = {"id": client_id, "cid": client_id, "name": client_name, "short": client_short, "dir": "client", "partners": [], "products": []}

    empty_config = {"title": "", "cnt": "", "filters": [], "groups": [], "cards": [], "metrics": [], "dirWord": {}, "badgeClass": {}}
    overview = {"competitive": {**empty_config, "cards": lanes["competitive"]}, "market": {**empty_config, "cards": lanes["market"]}, "technology": {**empty_config, "cards": lanes["technology"]}}

    top_tenders = []
    for row in table(database, "serving", "market_top_opportunity_tender"):
        top_tenders.append({
            "id": text(first_nonempty(row, "top_opportunity_tender_id", "tender_id")),
            "title": text(row.get("tender_id")), "decides": text(row.get("decides")),
            "ksslFit": text(row.get("kssl_fit")), "ksslModel": text(row.get("kssl_model")),
            "rival": text(row.get("rival_to_beat")), "revenue": text(row.get("revenue_text")),
            "status": text(row.get("status")),
        })
    top_projects = []
    for row in table(database, "serving", "market_top_opportunity_project"):
        top_projects.append({
            "id": text(first_nonempty(row, "top_opportunity_project_id", "opportunity_id")),
            "title": text(row.get("opportunity_id")), "country": text(row.get("country_name")),
            "stage": text(row.get("where_it_stands")), "revenue": text(row.get("revenue_text")),
            "ksslFit": text(row.get("kssl_fit")), "ksslModel": text(row.get("kssl_model")),
        })
    next_moves = []
    for row in table(database, "serving", "market_next_move"):
        next_moves.append({
            "id": text(row.get("next_move_id")), "action": text(row.get("action_text")),
            "days": row.get("days_remaining"), "tenderTitle": text(row.get("tender_title")),
        })

    return {
        "client": client,
        "database": database,
        "overviewConfig": overview,
        "geoCountries": geo_countries,
        "geoData": geo_data,
        "geoComps": geo_comps,
        "competitors": competitors,
        "compOrder": comp_order,
        "competitorNews": {},
        "competitiveCards": lanes["competitive"],
        "marketCards": lanes["market"],
        "techCards": lanes["technology"],
        "details": details,
        "matchups": matchups,
        "POS_CATS": pos_cats,
        "CAT_KEY": cat_key,
        "tenders": tenders,
        "globalRequirements": requirements,
        "topOpportunities": {"topTenders": top_tenders, "projectsBeforeTender": top_projects, "nextMoves": next_moves},
        "PATENTS": {"byArea": {}, "byAssignee": {}, "_meta": {"total": 0}},
        "innovations": innovations,
        "techCats": tech_cats,
        "techAreaMeta": tech_area_meta,
        "KSSL_PARTNERS": [],
        "sourceRegistry": {},
        "companySources": {},
        "competitorStructure": {},
        "competitorMetrics": {},
        "projects": projects,
        "projectsConfig": projects_config,
        "competitorMoment": build_competitor_moment(database),
    }


@app.get("/api/health")
def health():
    try:
        with connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return {"ok": True, "database": "kssl_frontend", "schemas": ["ui", "serving"]}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"ok": False, "error": str(exc)})


@app.get("/api/dataset")
def dataset():
    try:
        database = load_all_tables()
        payload = build_dataset(database)
        payload["databaseSchema"] = load_schema_manifest()
        return payload
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"error": f"PostgreSQL dataset unavailable: {exc}"})


@app.get("/api/manifest")
def manifest():
    try:
        schema = load_schema_manifest()
        return {"schemas": schema, "read_only": True}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"error": str(exc)})
