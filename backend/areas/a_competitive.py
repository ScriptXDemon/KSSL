"""Area A: client, competitors (Profile), overview signal feeds + drawers, Competitor Moment.

Audit: docs/audit_v2/A_overview_profile_moment.md. Runs first: other areas read d["competitors"].
"""

from collections import defaultdict
from typing import Any

from backend.common import first_nonempty, rows_by_id, slug, table, text


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
            "dir": text(row.get("classification")),
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



def build(database, d):
    account_rows = table(database, "serving", "client_account")
    account = account_rows[0] if account_rows else {}
    client_id = text(account.get("client_id"))
    client_name = text(first_nonempty(account, "client_name", "legal_name", "brand_name"))
    client_short = text(first_nonempty(account, "brand_name", "client_name"))
    competitors, comp_order = build_competitors(database)
    client = {"id": client_id, "name": client_name, "short": client_short}
    if client_id and client_id not in competitors:
        competitors[client_id] = {"id": client_id, "cid": client_id, "name": client_name, "short": client_short, "dir": "client", "partners": [], "products": []}
    details = d["details"]
    lanes = build_signals(database, details)
    empty_config = {"title": "", "cnt": "", "filters": [], "groups": [], "cards": [], "metrics": [], "dirWord": {}, "badgeClass": {}}
    d.update({
        "client": client,
        "competitors": competitors,
        "compOrder": comp_order,
        "competitorNews": {},
        "overviewConfig": {k: {**empty_config, "cards": lanes[k]} for k in ("competitive", "market", "technology")},
        "competitiveCards": lanes["competitive"],
        "marketCards": lanes["market"],
        "techCards": lanes["technology"],
        "competitorMoment": build_competitor_moment(database),
        "competitorStructure": {},
        "competitorMetrics": {},
    })
