-- ============================================================
-- NUQE — Migration 008: Users
-- Staff accounts for login and audit attribution.
-- pgcrypto (enabled in migration 001) seeds the demo admin user.
-- ============================================================

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(200) UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  full_name        VARCHAR(150) NOT NULL,
  role             VARCHAR(20) NOT NULL DEFAULT 'staff'
                   CHECK (role IN ('staff', 'admin', 'read_only')),
  organisation_id  UUID,
  is_active        BOOLEAN DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Demo seed: admin@nuqe.io / NuqeAdmin2026! (bcrypt cost 12 via pgcrypto)
INSERT INTO users (email, password_hash, full_name, role)
VALUES (
  'admin@nuqe.io',
  crypt('NuqeAdmin2026!', gen_salt('bf', 12)),
  'Nuqe Admin',
  'admin'
) ON CONFLICT (email) DO NOTHING;
