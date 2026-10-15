"""Database-backed KSSL dataset API.

The browser cannot connect to PostgreSQL directly. This small API reads the two
schema namespaces, exposes every table under ``database`` for traceable access,
and adapts the domain tables into the contract consumed by the existing React UI.
An empty database therefore produces empty arrays and maps throughout the UI.
"""

import os
from typing import Any

import psycopg2
import psycopg2.extras
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from backend.areas import a_competitive, b_products, c_network, d_market_tech
from backend.common import json_value

AREAS = (a_competitive, b_products, c_network, d_market_tech)  # a first: others read competitors


DSN = os.environ.get("KSSL_DSN", "").strip()
# Review flow (db/migrations/001_staging.sql): the live backend reads ui / serving; the review
# backend (KSSL_VIEW=review) reads the staged copies, under the same "ui" / "serving" keys.
REVIEW = os.environ.get("KSSL_VIEW", "").strip().lower() == "review"
SOURCE_SCHEMA = {"ui": "staging_ui", "serving": "staging"} if REVIEW else {"ui": "ui", "serving": "serving"}

app = FastAPI(title="KSSL PostgreSQL Dataset API", docs_url=None, redoc_url=None)
from backend.news import router as news_router; app.include_router(news_router)  # noqa: E402,E702
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def build_dataset(database):
    """The UI contract. Each area module fills its keys; nothing is defaulted beyond empty."""
    d = {"database": database, "details": {}, "sourceRegistry": {}, "companySources": {}}
    for area in AREAS:
        area.build(database, d)
    return d


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
            for schema, source in SOURCE_SCHEMA.items():
                cur.execute(
                    """
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                      AND table_name NOT IN ('fact_source', 'review_decision')
                    ORDER BY table_name
                    """,
                    (source,),
                )
                for name in [r["table_name"] for r in cur.fetchall()]:
                    cur.execute(
                        'SELECT * FROM "{}"."{}"'.format(source, name.replace('"', '""'))
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
