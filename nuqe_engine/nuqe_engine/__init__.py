"""
Nuqe deterministic obligation engine.

The public API is in `nuqe_engine.engine`. Everything else is internal.

Example:
    from nuqe_engine import Engine, Event, TriggerEvent

    engine = Engine.from_env()
    result = engine.process_event(
        Event(event=TriggerEvent.COMPLAINT_RECEIVED, case_id=case_id, ...)
    )
"""

from nuqe_engine.schema import (
    ObligationRow,
    RawObligationRow,
    TriggerEvent,
)

__all__ = [
    "ObligationRow",
    "RawObligationRow",
    "TriggerEvent",
]

__version__ = "0.1.0"
