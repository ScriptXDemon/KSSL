"""Area B: Products, Product Evaluation (matchups). Gap Analysis is hidden by decision.

Audit: docs/audit_v2/B_products_evaluation_gap.md.
"""

from collections import defaultdict
from typing import Any

from backend.common import first_nonempty, rows_by_id, slug, table, text


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
        category_key = slug(category)
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



def build(database, d):
    matchups, pos_cats, cat_key = build_matchups(database)
    d.update({"matchups": matchups, "POS_CATS": pos_cats, "CAT_KEY": cat_key})
