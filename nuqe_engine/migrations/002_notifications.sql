-- Migration 002: notifications table
CREATE TABLE IF NOT EXISTS nuqe_engine.notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES nuqe_engine.cases(id),
    obligation_id       TEXT NOT NULL,
    version             TEXT NOT NULL,
    notification_type   TEXT NOT NULL,
    payload             JSONB NOT NULL,
    delivery_status     TEXT NOT NULL DEFAULT 'pending',
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON nuqe_engine.notifications(delivery_status);
CREATE INDEX IF NOT EXISTS idx_notifications_case ON nuqe_engine.notifications(case_id);
