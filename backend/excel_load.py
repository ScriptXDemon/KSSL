"""Excel -> kssl_staging loader for client-supplied workbooks (competitors + leadership).  Never touches kssl_serving.

    python -m backend.excel_load leadership --file "<Company Directors Details - Re-verified.xlsx>" [--db local|vps] [--dry-run]
                                            [--compare "<leadership profile.xlsx>"] [--reports DIR]
    python -m backend.excel_load --selftest                       (no database, no files)

leadership: one competitor per company (inserted if missing, an existing row is never changed), one competitive_leader
per person, one competitive_leader_record per verified bullet, and the matching staging.fact_source rows.  The workbook
is the source of truth for leadership: the leaders / records / fact_source rows of the competitors in the file are
deleted and re-inserted in ONE transaction (idempotent).  Competitors are never deleted.

Nothing unverified is loaded.  A role is loaded when the FINAL Position status is Verified / Verified (pass 2).  A
bullet is loaded when its field's FINAL status is Verified / Verified (pass 2), or when the claims that match it
(Claim Evidence 'Supported', or a Pass 2 'Supported' verdict) support it and no matching claim is unsupported.
Everything held back goes to <reports>/leadership_held_back.csv with the reason and, where the workbook has one,
the suggested correction; counts per company go to <reports>/leadership_summary.txt.  The workbook is client data
and the repository is public: the default reports folder db/excel_reports/ is gitignored; never commit it.

DSN: prompts.batch.resolve_dsn (--db vps needs the tunnel, routines/tunnel.sh).  The target is printed without the password.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REPORTS = ROOT / "db" / "excel_reports"

SHEET_DIR, SHEET_SUM, SHEET_CE, SHEET_P2, SHEET_APPLIED = (
    "Company Directory (Corrected)", "Re-verification Summary", "Claim Evidence", "Pass 2 Results", "Applied Changes")
OK_STATUS = {"Verified", "Verified (pass 2)"}
FIELDS = {"experience": ("Professional Experience", "FINAL Experience"), "education": ("Education Background", "FINAL Education")}
# Excel company name -> display_name of the competitor that already exists (news / products are linked to it)
EXISTING_COMPETITORS = {
    "Larsen & Toubro (L&T)": "Larsen & Toubro",
    "Adani Defence": "Adani Defence & Aerospace",
    "Hanwha (Aerospace/Group)": "Hanwha Aerospace",
}
HEADLINE_MAX = 300                      # competitive_leader_record.headline varchar(300)
SUPPORT_MIN, UNSUPPORTED_MIN, UNSUPPORTED_BEST_MIN = 0.6, 0.6, 0.35   # claim -> bullet token containment
MAX_FACT_URLS = 3                       # fact_source rows per role / record
TITLES = {"dr", "mr", "mrs", "ms", "miss", "shri", "smt", "prof", "professor", "gen", "adm", "lt", "col", "maj", "capt", "cdr",
          "brig", "sir", "eng", "ing", "dipl", "vadm", "radm", "cmde", "air", "marshal", "general", "admiral", "lieutenant",
          "colonel", "major", "captain", "commodore", "brigadier", "hon", "rt", "mohd"}


# ---- ids, text helpers ----------------------------------------------------------------------------------------

def competitor_id_for(name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, "kssl-competitor|" + name)


def leader_id_for(competitor_id, full_name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"kssl-leader|{competitor_id}|{full_name}")


def record_id_for(leader_id, record_type: str, position: int) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"kssl-leader-record|{leader_id}|{record_type}|{position}")


def split_bullets(cell) -> list[str]:
    """One bullet per line; the bullet glyph (U+2022, or U+FFFD where the encoding was lost), -, * and spaces are stripped."""
    out = []
    for line in str(cell or "").replace("\r", "\n").split("\n"):
        line = re.sub(r"^[\s•�\-\*–—·]+", "", line).strip()
        line = re.sub(r"\s+", " ", line)
        if line:
            out.append(line)
    return out


def initials(name: str) -> str:
    """First + last word of the name, uppercase, titles (Dr, Shri, Gen, Adm, Lt...) skipped: 'Dr Jane Example' -> 'JE'."""
    words = [w for w in re.split(r"[\s]+", name.strip()) if w]
    kept = [w for w in words if re.sub(r"[^a-z]", "", w.casefold()) not in TITLES] or words
    letters = [next((c for c in w if c.isalpha()), "") for w in kept]
    letters = [c for c in letters if c]
    if not letters:
        return ""
    return (letters[0] + (letters[-1] if len(letters) > 1 else "")).upper()


def norm_text(s: str) -> str:
    """casefold, collapse spaces, strip punctuation at both ends."""
    s = re.sub(r"\s+", " ", str(s or "").casefold()).strip()
    return re.sub(r"^[\W_]+|[\W_]+$", "", s)


_STOP = {"the", "of", "a", "an", "and", "at", "in", "as", "for", "to", "by", "with", "from", "is", "was", "its", "his", "her",
         "has", "had", "also", "on", "or", "be", "that", "which", "per"}


def tokens(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", str(s or "").casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = set()
    for t in re.findall(r"[^\W_]+", s):
        if t in _STOP:
            continue
        if len(t) > 4 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        out.add(t)
    return out


def containment(claim: str, bullet: str) -> float:
    """Share of the claim's content tokens found in the bullet; 1.0 when one normalised text is a prefix of the other."""
    nc, nb = norm_text(claim), norm_text(bullet)
    if nc and nb and (nb.startswith(nc) or nc.startswith(nb)):
        return 1.0
    ct = tokens(claim)
    return len(ct & tokens(bullet)) / len(ct) if ct else 0.0


def urls_of(cell) -> list[str]:
    return [u for u in re.split(r"\s+", str(cell or "").strip()) if u]


def to_int(v) -> int:
    return int(float(str(v).strip()))


# ---- workbook -------------------------------------------------------------------------------------------------

def read_sheets(path: Path, wanted=(SHEET_DIR, SHEET_SUM, SHEET_CE, SHEET_P2, SHEET_APPLIED)) -> dict[str, list[dict]]:
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    for name in wb.sheetnames:
        if name not in wanted:
            continue
        it = wb[name].iter_rows(values_only=True)
        head = next(it, None)
        if not head:
            continue
        out[name] = [dict(zip(head, r)) for r in it if any(c is not None and str(c).strip() != "" for c in r)]
    return out


def compare_sheets(a: dict, b: dict) -> list[str]:
    """Differences of the sheets the two workbooks share (SHEET_DIR, SHEET_SUM), cell by cell; Input Row compared as int."""
    diffs = []
    for sh in (SHEET_DIR, SHEET_SUM):
        if sh not in b:
            diffs.append(f"{sh}: missing in the second file")
            continue
        ra, rb = a[sh], b[sh]
        if len(ra) != len(rb):
            diffs.append(f"{sh}: {len(ra)} rows vs {len(rb)} rows")
        for i, (x, y) in enumerate(zip(ra, rb)):
            for k in x:
                vx, vy = x.get(k), y.get(k)
                if k == "Input Row":
                    vx, vy = to_int(vx), to_int(vy)
                if (vx if vx not in ("",) else None) != (vy if vy not in ("",) else None):
                    diffs.append(f"{sh} row {i + 2} col {k!r}: {str(vx)[:60]!r} vs {str(vy)[:60]!r}")
    return diffs


def apply_overrides(sheets: dict, other: dict) -> list[tuple]:
    """The second workbook is a later cut of 'Company Directory (Corrected)': where a cell differs, its value wins.
    Returns [(input row, column, old, new)].  'Cells changed' is bookkeeping, not data, and is left alone."""
    out = []
    for i, (x, y) in enumerate(zip(sheets[SHEET_DIR], other[SHEET_DIR])):
        for k in x:
            if k != "Cells changed" and (x.get(k) or None) != (y.get(k) or None):
                out.append((i + 2, k, x.get(k), y.get(k)))
                x[k] = y.get(k)
    return out


# ---- claims ---------------------------------------------------------------------------------------------------

@dataclass
class Claim:
    text: str
    supported: bool
    result: str                                   # 'Supported' | 'Not established' | 'Contradicted' | 'Still not found'
    evidence: list = field(default_factory=list)  # [(url, quote, quote_check)]
    fix: str = ""                                 # Fix / caveat or Pass 2 'Correct value'
    suggested: str = ""                           # replacement text the workbook proposes (contradicted claims)
    origin: str = "Claim Evidence"


_QC_RANK = {"verbatim in source": 0, "not machine-checked (live fetch / scan / archive)": 1}


def _ev_sort(rows):
    return sorted(rows, key=lambda e: _QC_RANK.get(e[2], 2))


def build_claims(ce_rows: list[dict], p2_rows: list[dict]) -> dict[tuple, list[Claim]]:
    """(input row, 'experience'|'education') -> claims.  A Pass 2 verdict replaces the Claim Evidence claims it re-checked."""
    by_field = {v[0]: k for k, v in FIELDS.items()}
    ev = defaultdict(dict)                                    # key -> norm claim -> Claim
    for r in ce_rows:
        f = by_field.get(r.get("Field"))
        if not f or not r.get("Claim"):
            continue
        key, nc = (to_int(r["Input Row"]), f), norm_text(r["Claim"])
        res = (r.get("Result") or "").strip()
        c = ev[key].setdefault(nc, Claim(str(r["Claim"]).strip(), res == "Supported", res or "none"))
        if r.get("Source URL"):
            c.evidence.append((str(r["Source URL"]).strip(), (r.get("Quote") or "").strip() or None, r.get("Quote check")))
        if r.get("Fix / caveat") and not c.fix:
            c.fix = str(r["Fix / caveat"]).strip()
    p2 = defaultdict(dict)
    for r in p2_rows:
        f = r.get("Field")
        if f not in FIELDS or not r.get("Claim"):
            continue
        key, nc = (to_int(r["Input Row"]), f), norm_text(r["Claim"])
        verdict = (r.get("Accepted verdict") or "").strip()
        c = p2[key].setdefault(nc, Claim(str(r["Claim"]).strip(), False, "Still not found", origin="Pass 2 Results"))
        if verdict == "Supported" or (verdict == "Contradicted" and c.result != "Supported"):
            c.supported, c.result = verdict == "Supported", verdict
        if verdict == "Supported" and r.get("Source URL"):
            c.evidence.append((urls_of(r["Source URL"])[0], (r.get("Quote") or "").strip() or None, r.get("Quote check")))
        if r.get("Correct value (if contradicted)") and not c.fix:
            c.fix = str(r["Correct value (if contradicted)"]).strip()
    claims = defaultdict(list)
    for key in set(ev) | set(p2):
        pool = list(ev[key].values())
        for p in p2[key].values():                           # drop the evidence claims this Pass 2 claim re-checked
            if p.result == "Contradicted":
                p.suggested = p.fix
            pool = [e for e in pool if e.supported or not (containment(p.text, e.text) >= 0.75 or containment(e.text, p.text) >= 0.75)]
        for p in p2[key].values():
            # re-checked evidence claims stay dropped only when the Pass 2 claim is in the pool
            pool.append(p)
        for c in pool:
            if c.result == "Contradicted" and c.origin == "Claim Evidence":
                c.suggested = c.fix
        claims[key] = pool
    return claims


def match_bullets(bullets: list[str], claims: list[Claim]) -> tuple[list[list[Claim]], list[list[Claim]], list[Claim]]:
    """(supporting claims per bullet, unsupported claims per bullet, unmatched unsupported claims).
    A supported claim goes to its best-matching bullet(s) (containment >= SUPPORT_MIN); an unsupported claim to every bullet
    it overlaps (>= UNSUPPORTED_MIN, else the best one if >= UNSUPPORTED_BEST_MIN) so it can only hold a bullet back."""
    sup = [[] for _ in bullets]
    uns = [[] for _ in bullets]
    orphans = []
    for c in claims:
        scores = [containment(c.text, b) for b in bullets]
        if not scores:
            if not c.supported:
                orphans.append(c)
            continue
        best = max(scores)
        if c.supported:
            if best >= SUPPORT_MIN:
                for i, s in enumerate(scores):
                    if s == best:
                        sup[i].append(c)
        else:
            hit = [i for i, s in enumerate(scores) if s >= UNSUPPORTED_MIN] or \
                  ([scores.index(best)] if best >= UNSUPPORTED_BEST_MIN else [])
            for i in hit:
                uns[i].append(c)
            if not hit:
                orphans.append(c)
    return sup, uns, orphans


def uncovered_years(bullet: str, claims: list[Claim]) -> list[str]:
    """4-digit years of the bullet that none of the supporting claims mentions."""
    year = re.compile(r"(?<!\d)(?:19|20)\d\d(?!\d)")
    have = set(year.findall(" ".join(c.text for c in claims)))
    return sorted(set(year.findall(bullet)) - have)


def pick_sources(claims: list[Claim]) -> list[tuple[str, str | None]]:
    """distinct (url, quote) of the supporting claims, verbatim-checked first, at most MAX_FACT_URLS."""
    seen, out = set(), []
    rows = [e for c in claims for e in c.evidence]
    for url, quote, _qc in _ev_sort(rows):
        if url not in seen:
            seen.add(url)
            out.append((url, quote))
    return out[:MAX_FACT_URLS]


# ---- plan -----------------------------------------------------------------------------------------------------

@dataclass
class Plan:
    competitors: list = field(default_factory=list)   # [{name, id, existing, display_name}]
    leaders: list = field(default_factory=list)       # [{leader_id, competitor_id, full_name, role_title, organization, avatar_initials, role_source_url}]
    records: list = field(default_factory=list)       # [{record_id, leader_id, record_type, headline, source_url}]
    facts: list = field(default_factory=list)         # [{table_name, row_id, column_name, source_url, quote, company}]
    held: list = field(default_factory=list)          # csv rows
    stats: dict = field(default_factory=dict)         # company -> counters
    linkedin: list = field(default_factory=list)
    warnings: list = field(default_factory=list)


def _count(plan: Plan, company: str, key: str, n: int = 1):
    plan.stats.setdefault(company, defaultdict(int))[key] += n


def build_plan(sheets: dict, existing: dict[str, str] | None = None) -> Plan:
    """existing: display_name -> competitor_id already in the database (the three mapped companies must be there)."""
    existing = existing or {}
    cd, rv = sheets[SHEET_DIR], sheets[SHEET_SUM]
    claims = build_claims(sheets.get(SHEET_CE, []), sheets.get(SHEET_P2, []))
    pos_claims = defaultdict(list)
    for r in sheets.get(SHEET_CE, []):
        if r.get("Field") == "Current Position" and r.get("Source URL"):
            pos_claims[to_int(r["Input Row"])].append((str(r["Source URL"]).strip(), (r.get("Quote") or "").strip() or None, r.get("Quote check")))
    applied = defaultdict(list)                         # (row, field) -> [(old bullet, new bullet)]
    for r in sheets.get(SHEET_APPLIED, []):
        applied[(to_int(r["Input Row"]), r["Field"])].append((split_bullets(r["Old bullet (as entered)"]), split_bullets(r["New bullet (applied)"])))
    plan = Plan()
    by_lower = {k.casefold(): v for k, v in existing.items()}
    seen_company = {}
    summary = {to_int(r["Input Row"]): r for r in rv}
    seen_leader = set()

    def held(company, person, fld, value, reason, suggested="", source=""):
        plan.held.append({"company": company, "person": person, "field": fld, "bullet_or_value": value, "reason": reason,
                          "suggested_correction": suggested, "source": source})

    for idx, r in enumerate(cd):
        row = idx + 2
        s = summary.get(row)
        company, person = str(r["Company Name"]).strip(), str(r["People Name"]).strip()
        if not s or s["Company"] != company or not (norm_text(s["Person"]).startswith(norm_text(person)) or norm_text(person).startswith(norm_text(s["Person"]))):
            raise ValueError(f"row {row}: directory ({company} / {person}) does not match Re-verification Summary")
        if company not in seen_company:
            if company in EXISTING_COMPETITORS:
                disp = EXISTING_COMPETITORS[company]
                if disp not in existing:
                    raise ValueError(f"{company!r} must map to the existing competitor {disp!r}, which is not in the database")
                cid, ex = existing[disp], True
            elif company.casefold() in by_lower:
                cid, ex, disp = by_lower[company.casefold()], True, company
            else:
                cid, ex, disp = str(competitor_id_for(company)), False, company
            seen_company[company] = cid
            plan.competitors.append({"name": company, "id": cid, "existing": ex, "display_name": disp})
        cid = seen_company[company]
        lid = str(leader_id_for(cid, person))
        if lid in seen_leader:
            raise ValueError(f"duplicate person {person!r} in {company!r}")
        seen_leader.add(lid)
        urls = urls_of(r.get("Source URL"))
        first_url = urls[0] if urls else None
        _count(plan, company, "people")

        # --- role
        position = (r.get("Current Position") or "").strip()
        pstat = s["FINAL Position"]
        role_title = role_url = None
        if pstat in OK_STATUS and position:
            role_title = position[:200]
            src = pick_sources([Claim("", True, "Supported", pos_claims.get(row, []))])
            if not src and first_url:
                src = [(first_url, None)]
            role_url = src[0][0] if src else None
            for url, quote in src:
                plan.facts.append({"table_name": "competitive_leader", "row_id": lid, "column_name": "role_title", "source_url": url,
                                   "quote": quote, "company": company})
            _count(plan, company, "roles_loaded")
        else:
            _count(plan, company, "roles_held")
            held(company, person, "Current Position", position, f"FINAL Position status: {pstat}" + (f" ({s['Position Note']})" if s.get("Position Note") else ""),
                 source=first_url or "")
        plan.leaders.append({"leader_id": lid, "competitor_id": cid, "full_name": person, "role_title": role_title, "organization": company,
                             "avatar_initials": initials(person), "role_source_url": role_url})
        if s.get("LinkedIn URL"):
            plan.linkedin.append((company, person, s["LinkedIn URL"], s.get("LinkedIn Confidence"), s.get("LinkedIn Note")))

        # --- experience / education bullets
        for rtype, (col, stcol) in FIELDS.items():
            bullets = split_bullets(r.get(col))
            fstat = s[stcol]
            fld_ok = fstat in OK_STATUS
            sup, uns, orphans = match_bullets(bullets, claims.get((row, rtype), []))
            for c in orphans:
                plan.warnings.append(f"row {row} {person} {rtype}: unsupported claim matches no bullet: {c.text[:80]!r} [{c.result}]")
            for pos, b in enumerate(bullets, 1):
                suggested = "; ".join(dict.fromkeys(c.suggested for c in uns[pos - 1] if c.suggested))
                for olds, news in applied.get((row, col), []):
                    if any(norm_text(o) and norm_text(o) in norm_text(b) for o in olds) and not suggested:
                        suggested = "Applied Changes new bullet: " + " | ".join(news)
                if fld_ok:
                    ok, why = True, ""
                    if uns[pos - 1]:
                        plan.warnings.append(f"row {row} {person} {rtype} #{pos}: field is {fstat} but a matching claim is {uns[pos-1][0].result}: {uns[pos-1][0].text[:70]!r} (loaded)")
                elif uns[pos - 1]:
                    ok, why = False, "; ".join(f"claim {c.result}: {c.text}" + (f" ({c.fix})" if c.fix and not c.suggested else "") for c in uns[pos - 1])
                elif sup[pos - 1]:
                    ok, why = True, ""
                    missing = uncovered_years(b, sup[pos - 1])
                    if missing:      # the supporting claims do not mention every year of the bullet: part of it is unchecked
                        ok, why = False, f"supported claims cover only part of the bullet (year {', '.join(missing)} not in any supported claim: " + "; ".join(c.text for c in sup[pos - 1]) + ")"
                else:
                    ok, why = False, f"field {fstat}; no matching supported claim"
                if ok and len(b) > HEADLINE_MAX:
                    ok, why = False, f"longer than {HEADLINE_MAX} characters ({len(b)}): competitive_leader_record.headline is varchar({HEADLINE_MAX})"
                srcs = pick_sources(sup[pos - 1])
                if not srcs and first_url:
                    srcs = [(first_url, None)]
                if not ok:
                    _count(plan, company, f"{rtype}_held")
                    if not why.startswith("longer"):
                        why = f"field {fstat}: {why}" if not why.startswith("field") else why
                    held(company, person, col, b, why, suggested, srcs[0][0] if srcs else "")
                    continue
                if not srcs:
                    plan.warnings.append(f"row {row} {person} {rtype} #{pos}: no source URL at all (skipped)")
                    _count(plan, company, f"{rtype}_held")
                    held(company, person, col, b, "no source URL in the workbook", "", "")
                    continue
                rid = str(record_id_for(lid, rtype, pos))
                plan.records.append({"record_id": rid, "leader_id": lid, "record_type": rtype, "headline": b, "source_url": srcs[0][0]})
                for url, quote in srcs:
                    plan.facts.append({"table_name": "competitive_leader_record", "row_id": rid, "column_name": "headline", "source_url": url,
                                       "quote": quote, "company": company})
                _count(plan, company, f"{rtype}_loaded")
    return plan


# ---- reports --------------------------------------------------------------------------------------------------

def write_reports(plan: Plan, out_dir: Path, dry_run: bool) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    held_path, sum_path = out_dir / "leadership_held_back.csv", out_dir / "leadership_summary.txt"
    cols = ["company", "person", "field", "bullet_or_value", "reason", "suggested_correction", "source"]
    with held_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(plan.held)
    keys = ["people", "roles_loaded", "roles_held", "experience_loaded", "experience_held", "education_loaded", "education_held"]
    lines = [f"Leadership load summary ({'DRY RUN' if dry_run else 'loaded'})", "",
             f"{'company':40} " + " ".join(f"{k[:10]:>10}" for k in keys), "-" * 125]
    tot = defaultdict(int)
    for c in plan.competitors:
        st = plan.stats.get(c["name"], {})
        lines.append(f"{c['name'][:40]:40} " + " ".join(f"{st.get(k, 0):>10}" for k in keys))
        for k in keys:
            tot[k] += st.get(k, 0)
    lines += ["-" * 125, f"{'TOTAL':40} " + " ".join(f"{tot[k]:>10}" for k in keys), ""]
    lines.append(f"competitors: {len(plan.competitors)} ({sum(1 for c in plan.competitors if c['existing'])} existing, "
                 f"{sum(1 for c in plan.competitors if not c['existing'])} new)")
    lines += ["", f"LinkedIn URLs in the workbook (the schema has no LinkedIn column; listed here only): {len(plan.linkedin)}"]
    for company, person, url, conf, note in sorted(plan.linkedin, key=lambda x: (x[0], x[1])):
        lines.append(f"  [{conf}] {company} / {person}: {url}")
    if plan.warnings:
        lines += ["", f"warnings ({len(plan.warnings)}):"] + ["  " + w for w in plan.warnings]
    sum_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return held_path, sum_path


# ---- database -------------------------------------------------------------------------------------------------

def company_domains(url: str, names: set[str]) -> tuple:
    """Same rule as prompts.loader: a host whose main label is the company's compact name is the company's own site."""
    from backend.sources import host_of
    host = host_of(url)
    parts = host.split(".")
    label = parts[-3] if len(parts) >= 3 and parts[-2] in ("co", "com", "gov", "org", "ac", "net") else (parts[-2] if len(parts) >= 2 else host)
    label = re.sub(r"[^a-z0-9]", "", label)
    if any(n == label and len(n) >= 3 or (len(label) >= 5 and len(n) >= 5 and (n.startswith(label) or label.startswith(n))) for n in names):
        return (host,)
    return ()


def name_variants(company: str) -> set[str]:
    from prompts.loader import compact_name
    parts = {company, re.sub(r"\(.*?\)", " ", company)}
    for inner in re.findall(r"\((.*?)\)", company):
        parts.update(re.split(r"[/+]", inner))
        parts.add(inner.split()[0] if inner.split() else "")        # 'KNDS France' -> 'KNDS' (only from a parenthetical)
    generic = {"group", "aerospace", "defence", "defense", "systems", "industries", "corporation", "international", "air", "marine"}
    return {n for n in (compact_name(p) for p in parts if p.strip()) if len(n) >= 3 and n not in generic}


def existing_competitors(cur) -> dict[str, str]:
    cur.execute("SELECT display_name, competitor_id::text AS cid FROM staging.competitive_competitor")
    return {r["display_name"]: r["cid"] for r in cur.fetchall()}


def apply_plan(conn, plan: Plan, dry_run: bool) -> dict:
    from backend.sources import classify
    cur = conn.cursor()
    ids = [c["id"] for c in plan.competitors]
    cur.execute("SELECT leader_id::text AS lid FROM staging.competitive_leader WHERE competitor_id = ANY(%s::uuid[])", (ids,))
    old_leaders = [r["lid"] for r in cur.fetchall()]
    cur.execute("SELECT record_id::text AS rid FROM staging.competitive_leader_record WHERE leader_id = ANY(%s::uuid[])", (old_leaders,))
    old_records = [r["rid"] for r in cur.fetchall()]
    res = {"deleted_leaders": len(old_leaders), "deleted_records": len(old_records)}
    cur.execute("DELETE FROM staging.fact_source WHERE (table_name = 'competitive_leader' AND row_id = ANY(%s)) "
                "OR (table_name = 'competitive_leader_record' AND row_id = ANY(%s))", (old_leaders, old_records))
    res["deleted_facts"] = cur.rowcount
    cur.execute("DELETE FROM staging.competitive_leader_record WHERE leader_id = ANY(%s::uuid[])", (old_leaders,))
    cur.execute("DELETE FROM staging.competitive_leader WHERE competitor_id = ANY(%s::uuid[])", (ids,))
    new = 0
    for c in plan.competitors:
        cur.execute("INSERT INTO staging.competitive_competitor (competitor_id, display_name) SELECT %s, %s "
                    "WHERE NOT EXISTS (SELECT 1 FROM staging.competitive_competitor WHERE competitor_id = %s)", (c["id"], c["display_name"], c["id"]))
        new += cur.rowcount
    res["competitors_inserted"] = new
    for l in plan.leaders:
        cur.execute("INSERT INTO staging.competitive_leader (leader_id, competitor_id, full_name, role_title, organization, avatar_initials, "
                    "role_source_url, detail_route) VALUES (%(leader_id)s, %(competitor_id)s, %(full_name)s, %(role_title)s, %(organization)s, "
                    "%(avatar_initials)s, %(role_source_url)s, NULL)", l)
    for r in plan.records:
        cur.execute("INSERT INTO staging.competitive_leader_record (record_id, leader_id, record_type, headline, role_or_degree, "
                    "institution_or_employer, start_date, end_date, source_url) VALUES (%(record_id)s, %(leader_id)s, %(record_type)s, "
                    "%(headline)s, NULL, NULL, NULL, NULL, %(source_url)s)", r)
    names = {}
    tiers = defaultdict(int)
    for f in plan.facts:
        names.setdefault(f["company"], name_variants(f["company"]))
        tier = classify(f["source_url"], company_domains(f["source_url"], names[f["company"]])) or "unlisted"
        tiers[tier] += 1
        cur.execute("INSERT INTO staging.fact_source (table_name, row_id, column_name, source_url, source_tier, publisher, quote, retrieved_at) "
                    "VALUES (%s, %s, %s, %s, %s, NULL, %s, now())", (f["table_name"], f["row_id"], f["column_name"], f["source_url"], tier, f["quote"]))
    res.update(leaders=len(plan.leaders), records=len(plan.records), facts=len(plan.facts), tiers=dict(tiers))
    if dry_run:
        conn.rollback()
    else:
        conn.commit()
    return res


def cmd_leadership(args) -> int:
    from prompts import batch
    sheets = read_sheets(Path(args.file))
    overrides = []
    if args.compare:
        other = read_sheets(Path(args.compare))
        diffs = compare_sheets(sheets, other)
        print(f"compare with {Path(args.compare).name}: " + ("identical (Company Directory (Corrected) + Re-verification Summary)" if not diffs else f"{len(diffs)} differing cells"))
        for d in diffs[:80]:
            print("   ", d[:200])
        overrides = apply_overrides(sheets, other)
        if overrides:
            print(f"  -> {len(overrides)} cells taken from the second file (it differs from the first)")
    conn = batch.connect_db(args.db)
    try:
        plan = build_plan(sheets, existing_competitors(conn.cursor()))
        plan.warnings += [f"row {r} {c!r} taken from the second file: {str(o)[:70]!r} -> {str(n)[:70]!r}" for r, c, o, n in overrides]
        held_path, sum_path = write_reports(plan, Path(args.reports), args.dry_run)
        res = apply_plan(conn, plan, args.dry_run)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    tot = defaultdict(int)
    for st in plan.stats.values():
        for k, v in st.items():
            tot[k] += v
    print(("DRY RUN (rolled back)" if args.dry_run else "LOADED") + f": competitors {len(plan.competitors)} "
          f"({sum(1 for c in plan.competitors if c['existing'])} existing, {res['competitors_inserted']} inserted)")
    print(f"  leaders {res['leaders']}  (replaced {res['deleted_leaders']} leaders / {res['deleted_records']} records / {res['deleted_facts']} fact_source)")
    print(f"  roles loaded {tot['roles_loaded']}, held {tot['roles_held']}")
    for t in ("experience", "education"):
        print(f"  {t}: loaded {tot[t + '_loaded']}, held {tot[t + '_held']}")
    print(f"  records {res['records']}  fact_source {res['facts']}  tiers {res['tiers']}  warnings {len(plan.warnings)}")
    print(f"  reports: {held_path}\n           {sum_path}")
    return 0


# ---- selftest -------------------------------------------------------------------------------------------------

def _selftest() -> None:
    # bullet splitting
    assert split_bullets("• One.\n• • Two  words\n� Three\n- Four\n* Five\n\n  ") == ["One.", "Two words", "Three", "Four", "Five"]
    assert split_bullets(None) == [] and split_bullets("") == []
    # initials
    assert initials("Asha Rao") == "AR" and initials("Dr Jane Example") == "JE" and initials("Gen. Mark A. Milley") == "MM"
    assert initials("Shri Rajesh Kumar Singh") == "RS" and initials("Adm John Smith") == "JS" and initials("Madonna") == "M"
    assert initials("Lt Gen Anil Chauhan") == "AC" and initials("Prof. Dr. Ali Veli") == "AV" and initials("Éric Trappier") == "ÉT"
    # claim matching
    assert norm_text("  Hello,   World. ") == "hello, world"
    assert containment("Became KNDS France CEO on 5 January 2026", "Became KNDS France CEO on 5 January 2026 and also serves as EVP.") == 1.0
    assert containment("CEO of Pandrol 2023-2025", "Previously served as CEO of Pandrol (2023–2025).") == 1.0
    assert containment("Saïd Business School Oxford 2015", "Strategic Leadership programme, Said Business School, University of Oxford (2015–2016).") == 1.0
    assert containment("Plant Manager 2007-2010", "General Manager (2010–2013) and Plant Manager (2007–2010)") == 1.0
    assert containment("Faurecia Quality Manager 2004-2007", "Earlier served at Johnson Controls (2010–2013)") < 0.35
    bullets = ["Joined Wegmann in 1995 as Head of Systems Technology.", "Became Head of System Development in January 2004.", "Lecturing at Kassel."]
    cl = [Claim("Joined Wegmann in 1995", True, "Supported"), Claim("Joined as Head of Systems Technology", False, "Not established"),
          Claim("Head of System Development from January 2004", False, "Not established"), Claim("Lecturing experience at Kassel", True, "Supported"),
          Claim("Became chairman of the moon", False, "Not established")]
    sup, uns, orph = match_bullets(bullets, cl)
    assert [len(x) for x in sup] == [1, 0, 1] and [len(x) for x in uns] == [1, 1, 0], (sup, uns)
    assert orph == [cl[4]]
    assert uncovered_years("CEO of BMA (2018–2023), began in 1998.", [Claim("Began in 1998", True, "Supported")]) == ["2018", "2023"]
    assert uncovered_years("Joined in 1995.", [Claim("Joined 1995", True, "Supported")]) == []
    # Pass 2 verdicts: a Supported verdict replaces the Not established evidence claim it re-checked; others stay out
    ce = [{"Input Row": 5, "Field": "Professional Experience", "Claim": "Director of Roanne site 2006-2009", "Result": "Not established",
           "Source URL": "http://a.example/x", "Quote": "q", "Quote check": "no quote"},
          {"Input Row": 5, "Field": "Professional Experience", "Claim": "Joined in 1995", "Result": "Supported", "Source URL": "http://b.example/y",
           "Quote": "joined 1995", "Quote check": "verbatim in source"}]
    p2 = [{"Input Row": 5, "Field": "experience", "Claim": "Director of Roanne site (claimed 2006-2009)", "Accepted verdict": "Supported",
           "Source URL": "http://c.example/z\nhttp://d.example", "Quote": "roanne", "Quote check": None, "Correct value (if contradicted)": "dates not stated"}]
    cs = build_claims(ce, p2)[(5, "experience")]
    assert sorted((c.text, c.supported) for c in cs) == [("Director of Roanne site (claimed 2006-2009)", True), ("Joined in 1995", True)], cs
    assert [c for c in cs if c.origin == "Pass 2 Results"][0].evidence == [("http://c.example/z", "roanne", None)]
    # ids are deterministic and distinct
    c1 = competitor_id_for("Acme Corp")
    assert c1 == competitor_id_for("Acme Corp") != competitor_id_for("Acme Corp.")
    l1 = leader_id_for(c1, "A B")
    assert l1 == leader_id_for(str(c1), "A B") != leader_id_for(c1, "A C")
    assert record_id_for(l1, "experience", 1) == record_id_for(str(l1), "experience", 1)
    assert len({record_id_for(l1, "experience", 1), record_id_for(l1, "education", 1), record_id_for(l1, "experience", 2)}) == 3
    # a tiny end-to-end plan
    sheets = {SHEET_DIR: [{"Company Name": "Larsen & Toubro (L&T)", "People Name": "Dr Jane Example", "Current Position": "CTO",
                           "Professional Experience": "• Joined Wegmann in 1995 as Head.\n• Became head of R&D in 2009.", "Education Background": "• Diplom, Kassel.",
                           "Source URL": "http://s.example/1\nhttp://s.example/2"}],
              SHEET_SUM: [{"Input Row": "2.0", "Company": "Larsen & Toubro (L&T)", "Person": "Dr Jane Example", "FINAL Position": "Verified (pass 2)",
                           "FINAL Experience": "Not Found", "FINAL Education": "Mismatch", "Position Note": "n", "LinkedIn URL": None}],
              SHEET_CE: [{"Input Row": 2, "Field": "Current Position", "Claim": "CTO", "Result": None, "Source URL": "http://p.example", "Quote": "cto", "Quote check": "verbatim in source"},
                         {"Input Row": 2, "Field": "Professional Experience", "Claim": "Joined Wegmann in 1995", "Result": "Supported", "Source URL": "http://e.example", "Quote": "1995", "Quote check": "verbatim in source"},
                         {"Input Row": 2, "Field": "Education Background", "Claim": "Diplom Kassel", "Result": "Contradicted", "Source URL": "http://f.example", "Quote": "x", "Quote check": None, "Fix / caveat": "it was Hannover"}],
              SHEET_P2: [], SHEET_APPLIED: []}
    p = build_plan(sheets, {"Larsen & Toubro": "11111111-1111-1111-1111-111111111111"})
    assert p.competitors[0]["id"] == "11111111-1111-1111-1111-111111111111" and p.competitors[0]["existing"]
    assert p.leaders[0]["role_title"] == "CTO" and p.leaders[0]["avatar_initials"] == "JE" and p.leaders[0]["role_source_url"] == "http://p.example"
    assert [r["headline"] for r in p.records] == ["Joined Wegmann in 1995 as Head."] and p.records[0]["source_url"] == "http://e.example"
    assert [h["field"] for h in p.held] == ["Professional Experience", "Education Background"] and p.held[1]["reason"].count("Contradicted") == 1
    assert p.held[1]["suggested_correction"] == "it was Hannover"
    assert [r["record_id"] for r in p.records] == [r["record_id"] for r in build_plan(sheets, {"Larsen & Toubro": "11111111-1111-1111-1111-111111111111"}).records]
    print("excel_load selftest ok")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--selftest", action="store_true")
    sub = ap.add_subparsers(dest="cmd")
    lp = sub.add_parser("leadership", help="competitors + leaders + experience/education records")
    lp.add_argument("--file", required=True)
    lp.add_argument("--compare", help="a second workbook (a subset); differences are printed")
    lp.add_argument("--db", choices=["local", "vps"], default="local")
    lp.add_argument("--dry-run", action="store_true")
    lp.add_argument("--reports", default=str(DEFAULT_REPORTS), help="reports folder (default db/excel_reports/, gitignored)")
    args = ap.parse_args(argv)
    if args.selftest:
        _selftest()
        return 0
    if args.cmd == "leadership":
        return cmd_leadership(args)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
