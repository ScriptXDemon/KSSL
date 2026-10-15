"""Area C: Partnerships, Projects, Geo footprint, Patents.

Audit: docs/audit_v2/C_partners_projects_geo_patents.md.
"""

from collections import defaultdict
from typing import Any

from backend.common import first_nonempty, rows_by_id, slug, table, text


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
        company_id = text(first_nonempty(row, "competitor_id", "client_id"))
        if not company_id:
            continue
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
            geo_comps.append({"id": company_id, "name": text(row.get("company_name")), "isBf": row.get("company_role") == "client"})
    countries = sorted({country for by_country in geo.values() for country in by_country})
    return {k: {country: rows for country, rows in v.items()} for k, v in geo.items()}, geo_comps, countries



def build(database, d):
    geo_data, geo_comps, geo_countries = build_geo(database)
    projects, projects_config = build_projects(database, d["competitors"])
    d.update({
        "geoData": geo_data, "geoComps": geo_comps, "geoCountries": geo_countries,
        "projects": projects, "projectsConfig": projects_config,
        "PATENTS": {"byArea": {}, "byAssignee": {}, "_meta": {"total": 0}},
        "KSSL_PARTNERS": [],
    })
