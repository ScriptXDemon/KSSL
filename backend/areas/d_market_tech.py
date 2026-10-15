"""Area D: Market (tenders, top opportunity, global requirements) and Technology (innovations).

Audit: docs/audit_v2/D_market_technology.md.
"""

from collections import defaultdict
from typing import Any

from backend.common import first_nonempty, rows_by_id, slug, table, text


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



def build(database, d):
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

    tech_cats, tech_area_meta = build_technology_categories(database)
    d.update({
        "tenders": build_tenders(database),
        "globalRequirements": build_requirements(database),
        "topOpportunities": {"topTenders": top_tenders, "projectsBeforeTender": top_projects, "nextMoves": next_moves},
        "innovations": build_innovations(database),
        "techCats": tech_cats,
        "techAreaMeta": tech_area_meta,
    })
