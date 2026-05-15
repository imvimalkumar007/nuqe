"""
nuqe_api.scheduler — APScheduler-based deadline scanner for the Nuqe API.

scan_deadlines() runs on a schedule and checks all open cases for breached
deadlines. It is idempotent: running it twice produces exactly one audit entry
and one notification row per breach.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

import psycopg
import psycopg.types.json
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from nuqe_engine.audit import AuditEventType, append_audit_entry, get_audit_trail
from nuqe_engine.engine import Engine


# Lazy import to avoid circular imports and to keep metrics optional at module load
def _get_metrics() -> tuple[object, object]:
    from nuqe_api.metrics import deadline_breaches, scheduler_last_run
    return deadline_breaches, scheduler_last_run

logger = logging.getLogger(__name__)


def scan_deadlines(engine: Engine) -> dict[str, int]:
    """
    Scan all open cases for breached deadlines. Idempotent.

    For each breached deadline that has not yet been recorded, writes:
      - A DEADLINE_BREACHED audit entry.
      - A notification row in nuqe_engine.notifications.

    Returns:
        {"cases_scanned": n, "breaches_found": n, "breaches_recorded": n}
    """
    now = datetime.now(tz=UTC)
    cases_scanned = breaches_found = breaches_recorded = 0

    signing_key = engine._signing_key
    if isinstance(signing_key, str):
        signing_key = signing_key.encode()

    with psycopg.connect(engine._database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM nuqe_engine.cases WHERE status NOT IN ('closed', 'withdrawn')"
            )
            case_ids = [UUID(str(row[0])) for row in cur.fetchall()]

        for case_id in case_ids:
            cases_scanned += 1
            try:
                statuses = engine.due_obligations(case_id, as_of=now)
            except Exception as exc:
                logger.warning("due_obligations failed for case %s: %s", case_id, exc)
                continue

            for status in statuses:
                if status.deadline_status != "breached":
                    continue
                breaches_found += 1
                obl_id = status.obligation.obligation_id
                version = status.obligation.version

                # Idempotency: check for an existing DEADLINE_BREACHED entry
                try:
                    existing = get_audit_trail(
                        conn,
                        entity_id=case_id,
                        entity_type="fired_obligation",
                        event_type=AuditEventType.DEADLINE_BREACHED,
                        verify_signatures=False,
                        signing_key=signing_key,
                    )
                except Exception as exc:
                    logger.warning("audit_trail query failed for case %s: %s", case_id, exc)
                    continue

                already_recorded = any(
                    e.payload.get("obligation_id") == obl_id
                    and e.payload.get("version") == version
                    for e in existing
                )
                if already_recorded:
                    continue

                due_at = status.due_at
                breached_by = int((now - due_at).total_seconds()) if due_at else 0

                try:
                    append_audit_entry(
                        conn,
                        entity_type="fired_obligation",
                        entity_id=case_id,
                        event_type=AuditEventType.DEADLINE_BREACHED,
                        actor="scheduler",
                        payload={
                            "obligation_id": obl_id,
                            "version": version,
                            "due_at": due_at.isoformat() if due_at else None,
                            "breached_by_seconds": breached_by,
                            "case_id": str(case_id),
                        },
                        signing_key=signing_key,
                    )

                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO nuqe_engine.notifications
                                (case_id, obligation_id, version,
                                 notification_type, payload)
                            VALUES (%s, %s, %s, 'deadline_breached', %s)
                            """,
                            (
                                str(case_id),
                                obl_id,
                                version,
                                psycopg.types.json.Jsonb(
                                    {"breached_by_seconds": breached_by}
                                ),
                            ),
                        )
                except Exception as exc:
                    logger.warning(
                        "Failed to record breach for case %s obl %s: %s",
                        case_id,
                        obl_id,
                        exc,
                    )
                    continue

                breaches_recorded += 1

    summary = {
        "cases_scanned": cases_scanned,
        "breaches_found": breaches_found,
        "breaches_recorded": breaches_recorded,
    }
    logger.info("scan_deadlines complete: %s", summary)

    # Update Prometheus metrics
    try:
        _deadline_breaches, _scheduler_last_run = _get_metrics()
        _deadline_breaches.inc(breaches_recorded)  # type: ignore[attr-defined]
        _scheduler_last_run.set(now.timestamp())  # type: ignore[attr-defined]
    except Exception as exc:
        logger.debug("Could not update Prometheus metrics: %s", exc)

    return summary


def create_scheduler(
    engine: Engine, *, cron_schedule: str = "0 2 * * *"
) -> BackgroundScheduler:
    """Create and configure the APScheduler deadline scanner."""
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        scan_deadlines,
        CronTrigger.from_crontab(cron_schedule),
        id="deadline_scanner",
        args=[engine],
    )
    return scheduler
