-- F3.2: Per-org library storage
-- Run as: nuqe (migration role)

CREATE TABLE nuqe_engine.organisation_libraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES nuqe_engine.organisations(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    xlsx_bytes BYTEA NOT NULL,
    content_hash TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    approved_count INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    UNIQUE (org_id, version)
);

CREATE INDEX idx_org_libraries_org_active
    ON nuqe_engine.organisation_libraries(org_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX idx_org_libraries_one_active_per_org
    ON nuqe_engine.organisation_libraries(org_id)
    WHERE is_active = TRUE;

ALTER TABLE nuqe_engine.organisation_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuqe_engine.organisation_libraries FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_libraries_org_isolation ON nuqe_engine.organisation_libraries
    USING (org_id = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Grant to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON nuqe_engine.organisation_libraries TO nuqe_app;
