"""
CLI entry point for the Nuqe obligation engine.

Commands:
    nuqe-engine migrate     — Apply all pending database migrations
    nuqe-engine load <path> — Load library from file and report defects (dry run)
    nuqe-engine validate    — Load library from LIBRARY_PATH env and report defects
    nuqe-engine sync        — Validate and sync library to Postgres
    nuqe-engine status      — Show obligation count and last sync time
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

import click

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://nuqe:nuqe_secret@localhost:5433/nuqe_engine",
    )


def _migration_database_url() -> str:
    """Return MIGRATION_DATABASE_URL if set, else fall back to DATABASE_URL.

    The migration role (nuqe) is a superuser and can run DDL.
    The app role (nuqe_app) is non-privileged and cannot run DDL.
    Always use this function for the ``migrate`` command.
    """
    return os.environ.get("MIGRATION_DATABASE_URL") or _database_url()


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable DEBUG logging.")
def cli(verbose: bool) -> None:
    """Nuqe obligation engine — regulatory compliance automation."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s %(message)s")


# ── migrate ───────────────────────────────────────────────────────────────


@cli.command()
def migrate() -> None:
    """Apply all pending SQL migrations to the database."""
    from scripts.migrate import run_migrations

    db_url = _migration_database_url()
    click.echo(f"Connecting to {db_url!r} …")
    try:
        count = run_migrations(db_url)
    except Exception as exc:
        click.echo(f"Migration failed: {exc}", err=True)
        sys.exit(1)

    if count:
        click.echo(f"Applied {count} migration(s).")
    else:
        click.echo("Nothing to apply — database is up to date.")


# ── load ──────────────────────────────────────────────────────────────────


@cli.command("load")
@click.argument("path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--approved-only/--all",
    default=True,
    help="Load only rows with review_status='approved' (default) or all rows.",
)
def load_cmd(path: Path, approved_only: bool) -> None:
    """Load the obligation library from PATH and report any defects (dry run)."""
    from nuqe_engine.loader import load_library
    from nuqe_engine.validator import validate

    click.echo(f"Loading {path} …")
    raw = load_library(path, approved_only=approved_only)
    click.echo(f"Loaded {len(raw)} raw rows.")

    result = validate(raw)
    click.echo(f"Valid: {len(result.valid)}  Defects: {len(result.defects)}")

    errors = [d for d in result.defects if d.severity == "error"]
    warnings = [d for d in result.defects if d.severity == "warning"]

    if errors:
        click.echo(f"\n{len(errors)} ERROR(s):", err=True)
        for d in errors:
            click.echo(
                f"  Row {d.row_number} [{d.obligation_id}] {d.column}: {d.message}",
                err=True,
            )

    if warnings:
        click.echo(f"\n{len(warnings)} WARNING(s):")
        for d in warnings:
            click.echo(f"  Row {d.row_number} [{d.obligation_id}] {d.column}: {d.message}")

    if errors:
        sys.exit(1)


# ── validate ──────────────────────────────────────────────────────────────


@cli.command()
@click.option(
    "--path",
    envvar="LIBRARY_PATH",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to the obligation library (defaults to LIBRARY_PATH env var).",
)
def validate(path: Path) -> None:
    """Validate the obligation library and report defects."""
    from nuqe_engine.loader import load_library
    from nuqe_engine.validator import validate as _validate

    click.echo(f"Validating {path} …")
    raw = load_library(path, approved_only=True)
    result = _validate(raw)

    errors = [d for d in result.defects if d.severity == "error"]
    click.echo(f"Valid: {len(result.valid)}  Errors: {len(errors)}  Defects: {len(result.defects)}")

    for d in result.defects:
        prefix = "ERROR" if d.severity == "error" else "WARN "
        click.echo(f"  {prefix} Row {d.row_number} [{d.obligation_id}] {d.column}: {d.message}")

    if errors:
        sys.exit(1)


# ── sync ──────────────────────────────────────────────────────────────────


@cli.command()
@click.option(
    "--path",
    envvar="LIBRARY_PATH",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to the obligation library (defaults to LIBRARY_PATH env var).",
)
def sync(path: Path) -> None:
    """Validate and sync the obligation library to Postgres."""
    import psycopg

    from nuqe_engine.loader import load_library
    from nuqe_engine.sync import sync_to_database
    from nuqe_engine.validator import validate as _validate

    click.echo(f"Loading {path} …")
    raw = load_library(path, approved_only=True)
    result = _validate(raw)

    errors = [d for d in result.defects if d.severity == "error"]
    if errors:
        click.echo(f"{len(errors)} validation error(s) — aborting sync.", err=True)
        for d in errors:
            click.echo(
                f"  Row {d.row_number} [{d.obligation_id}] {d.column}: {d.message}",
                err=True,
            )
        sys.exit(1)

    db_url = _database_url()
    click.echo(f"Syncing {len(result.valid)} valid rows to {db_url!r} …")
    try:
        with psycopg.connect(db_url, autocommit=True) as conn:
            sync_result = sync_to_database(result.valid, conn)
    except Exception as exc:
        click.echo(f"Sync failed: {exc}", err=True)
        sys.exit(1)

    click.echo(
        f"Done — inserted: {sync_result.inserted}, unchanged: {sync_result.unchanged}"
    )
    if result.defects:
        click.echo(f"({len(result.defects)} warning(s) — run `validate` for details)")


# ── status ────────────────────────────────────────────────────────────────


@cli.command()
def status() -> None:
    """Show the obligation count and last sync time from the database."""
    import psycopg

    db_url = _database_url()
    try:
        with psycopg.connect(db_url, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE review_status = 'approved') AS approved,
                    MAX(synced_at) AS last_synced
                FROM nuqe_engine.obligations
                """
            )
            row = cur.fetchone()
    except Exception as exc:
        click.echo(f"Cannot connect to database: {exc}", err=True)
        sys.exit(1)

    if row is None or row[0] == 0:
        click.echo("No obligations in database. Run `nuqe-engine sync` first.")
        return

    total, approved, last_synced = row
    click.echo(f"Obligations: {total} total, {approved} approved")
    click.echo(f"Last synced: {last_synced.isoformat() if last_synced else 'never'}")
