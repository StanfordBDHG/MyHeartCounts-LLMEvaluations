#!/usr/bin/env python3
#
# This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
#
# SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
#
# SPDX-License-Identifier: MIT
#

"""Export all Supabase public tables into data/backups/supabase/<timestamp>/."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKUP_ROOT = REPO_ROOT / "data" / "backups" / "supabase"
PAGE_SIZE = 1000

# Used only when OpenAPI discovery is unavailable.
FALLBACK_PUBLIC_TABLES = [
    "evaluators",
    "nudges",
    "question_bundle_items",
    "question_bundles",
    "questions",
    "responses",
    "session_bundle",
    "session_nudges",
    "session_questions",
    "sessions",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export all public Supabase tables via the REST API into "
            "data/backups/supabase/<UTC-timestamp>/."
        ),
    )
    parser.add_argument(
        "--backup-root",
        type=Path,
        default=DEFAULT_BACKUP_ROOT,
        help="Directory that holds timestamped backup folders.",
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Postgres schema profile to export (default: public).",
    )
    parser.add_argument(
        "--tables",
        default="",
        help="Comma-separated table names to export (default: discover via OpenAPI).",
    )
    return parser.parse_args()


def non_empty_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def header_get(headers: dict[str, str], name: str) -> str | None:
    lowered = name.lower()
    for key, value in headers.items():
        if key.lower() == lowered:
            return value
    return None


def request_json(
    url: str,
    *,
    api_key: str,
    schema: str,
    method: str = "GET",
    extra_headers: dict[str, str] | None = None,
) -> tuple[Any, dict[str, str]]:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Accept-Profile": schema,
        "Content-Profile": schema,
    }
    if extra_headers:
        headers.update(extra_headers)

    request = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body) if body else []
            return payload, dict(response.headers.items())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed ({error.code} {error.reason}) for {url}: {detail}",
        ) from error


def discover_public_tables(base_url: str, api_key: str, schema: str) -> list[str]:
    openapi_url = f"{base_url.rstrip('/')}/rest/v1/"
    headers = {"Accept": "application/openapi+json"}
    spec, _ = request_json(openapi_url, api_key=api_key, schema=schema, extra_headers=headers)

    paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
    tables: list[str] = []
    for path in paths:
        if not path.startswith("/"):
            continue
        name = path.lstrip("/")
        if not name or name.startswith("rpc/"):
            continue
        if "/" in name:
            continue
        tables.append(name)

    if tables:
        return sorted(set(tables))

    return list(FALLBACK_PUBLIC_TABLES)


def parse_content_range(header_value: str | None) -> tuple[int, int, int | None]:
    if not header_value:
        return 0, 0, None
    match = re.fullmatch(r"(\d+)-(\d+)/(\d+|\*)", header_value.strip())
    if not match:
        return 0, 0, None
    start = int(match.group(1))
    end = int(match.group(2))
    total = None if match.group(3) == "*" else int(match.group(3))
    return start, end, total


def fetch_table_rows(
    base_url: str,
    api_key: str,
    schema: str,
    table: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        end = offset + PAGE_SIZE - 1
        table_url = (
            f"{base_url.rstrip('/')}/rest/v1/"
            f"{urllib.parse.quote(table, safe='')}?select=*"
        )
        batch, headers = request_json(
            table_url,
            api_key=api_key,
            schema=schema,
            extra_headers={
                "Range-Unit": "items",
                "Range": f"{offset}-{end}",
                "Prefer": "count=exact",
            },
        )

        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected response for table {table}: {type(batch)!r}")

        rows.extend(batch)
        if not batch:
            break

        _, range_end, total = parse_content_range(header_get(headers, "Content-Range"))
        if total is not None and range_end + 1 >= total:
            break
        if len(batch) < PAGE_SIZE:
            break

        offset += PAGE_SIZE

    return rows


def collect_fieldnames(rows: list[dict[str, Any]]) -> list[str]:
    fieldnames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    return fieldnames


def csv_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def write_table_json(path: Path, schema: str, table: str, rows: list[dict[str, Any]]) -> None:
    payload = {
        "schema": schema,
        "table": table,
        "row_count": len(rows),
        "rows": rows,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_table_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fieldnames = collect_fieldnames(rows)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: csv_cell(row.get(key)) for key in fieldnames})


def utc_timestamp_dir_name(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return current.strftime("%Y%m%dT%H%M%SZ")


def update_latest_symlink(backup_root: Path, timestamp_dir: Path) -> None:
    latest_link = backup_root / "latest"
    if latest_link.exists() or latest_link.is_symlink():
        latest_link.unlink()
    latest_link.symlink_to(timestamp_dir.name, target_is_directory=True)


def main() -> int:
    args = parse_args()

    try:
        supabase_url = non_empty_env("SUPABASE_URL")
        service_role_key = non_empty_env("SUPABASE_SERVICE_ROLE_KEY")
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    backup_root = args.backup_root.resolve()
    backup_root.mkdir(parents=True, exist_ok=True)

    timestamp_name = utc_timestamp_dir_name()
    backup_dir = backup_root / timestamp_name
    tables_dir = backup_dir / args.schema / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)

    if args.tables.strip():
        tables = [name.strip() for name in args.tables.split(",") if name.strip()]
    else:
        tables = discover_public_tables(supabase_url, service_role_key, args.schema)

    manifest_tables: list[dict[str, Any]] = []
    for table in tables:
        print(f"Exporting {args.schema}.{table}...")
        rows = fetch_table_rows(supabase_url, service_role_key, args.schema, table)
        json_rel = f"{args.schema}/tables/{table}.json"
        write_table_json(tables_dir / f"{table}.json", args.schema, table, rows)
        write_table_csv(tables_dir / f"{table}.csv", rows)
        manifest_tables.append(
            {
                "table": table,
                "full_name": f"{args.schema}.{table}",
                "row_count": len(rows),
                "file": json_rel,
            },
        )
        print(f"  wrote {len(rows)} row(s)")

    manifest = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_script": "scripts/backup_supabase_public.py",
        "schema": args.schema,
        "table_count": len(manifest_tables),
        "tables": manifest_tables,
    }
    manifest_path = backup_dir / f"manifest.{args.schema}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    update_latest_symlink(backup_root, backup_dir)

    print(f"Wrote backup to {backup_dir}")
    print(f"Updated symlink {backup_root / 'latest'} -> {timestamp_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
