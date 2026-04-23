# Component 02: Auth System

## Status
VERIFIED — all 10 tests passing (23 April 2026)

## Purpose
Protects all API endpoints except /health and /webhooks/quido.
Issues JWT access tokens (1 hour) and httpOnly refresh token
cookies (7 days). Enables the frontend to maintain sessions
across page refreshes via silent token refresh.

## Dependencies
- Database: users table (migration 008_users.sql — applied)
- All other components depend on this being correct

## Endpoints

### POST /api/v1/auth/login
Accept: { email: string, password: string }
Success: 200 { accessToken: string, user: { id, email, fullName, role } }
         + sets httpOnly cookie: refresh_token (7 day JWT)
Failure: 401 { error: "Invalid credentials" }
Validation: 400 if email or password missing
Side effect: writes login event to audit_log

### POST /api/v1/auth/refresh
Reads: refresh_token cookie
Success: 200 { accessToken: string }
Failure: 401 { error: "Invalid or expired refresh token" }

### POST /api/v1/auth/logout
Clears: refresh_token cookie
Success: 200 { message: "Logged out" }
Side effect: writes logout event to audit_log

### GET /api/v1/auth/me
Reads: Authorization: Bearer {token} header
Success: 200 { id, email, fullName, role, organisationId }
Failure: 401 { error: "Unauthorized" }

## Auth Middleware
File: api/src/middleware/auth.js
- Extracts Bearer token from Authorization header
- Verifies with JWT_SECRET
- Attaches decoded payload to req.user
- Returns 401 JSON if missing or invalid
- Applied globally EXCEPT: GET /health, POST /webhooks/quido,
  POST /auth/login, POST /auth/refresh

## Frontend Components
- web/src/context/AuthContext.jsx: stores user and accessToken in memory
- web/src/pages/LoginPage.jsx: email + password form, Nuqe dark theme
- web/src/components/shared/PrivateRoute.jsx: redirects to /login if not authenticated
- web/src/api/client.js: attaches Bearer token, handles 401 with refresh + retry

## Users Table Schema
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff'
    CHECK (role IN ('staff', 'admin', 'read_only')),
  organisation_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
```

## Demo Seed User
email: admin@nuqe.io
password: NuqeAdmin2026!
role: admin
hashed with bcrypt cost factor 12

## Tests

| ID | Description | Status | Notes |
|---|---|---|---|
| AUTH-001 | POST /auth/login with valid credentials returns 200 and access token | PASS | 23 Apr 2026 |
| AUTH-002 | POST /auth/login with wrong password returns 401 | PASS | 23 Apr 2026 |
| AUTH-003 | POST /auth/login with unknown email returns 401 | PASS | 23 Apr 2026 |
| AUTH-004 | POST /auth/login with missing fields returns 400 | PASS | 23 Apr 2026 |
| AUTH-005 | POST /auth/refresh with valid cookie returns new access token | PASS | 23 Apr 2026 |
| AUTH-006 | POST /auth/refresh with no cookie returns 401 | PASS | 23 Apr 2026 |
| AUTH-007 | POST /auth/logout clears the refresh_token cookie | PASS | 23 Apr 2026 |
| AUTH-008 | GET /auth/me with valid token returns user object | PASS | 23 Apr 2026 |
| AUTH-009 | GET /auth/me with no token returns 401 | PASS | 23 Apr 2026 |
| AUTH-010 | Protected route returns 401 when called without token | PASS | 23 Apr 2026 |

## Claude Code Prompt
```
Read spec/components/02_auth.md carefully.
Do not build anything yet.

First check:
1. Does api/src/db/migrations/006_users.sql exist?
2. Does api/src/routes/auth.js exist?
3. Does api/src/middleware/auth.js have real JWT verification?
4. Does web/src/pages/LoginPage.jsx exist?
5. Does web/src/context/AuthContext.jsx exist?

Report what exists and what does not. Then build only
what is missing, following the exact spec above.

After building, write tests AUTH-001 through AUTH-010
in api/src/routes/auth.test.js using Jest and supertest.
Run them and confirm they all pass before finishing.

Update test status in this file and spec/test_registry.md.
```
