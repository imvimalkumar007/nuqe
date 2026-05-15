# F3.3 Auth0 Setup — Production Cutover Runbook

## Overview

F3.3 ships the JWT verifier and all wiring. The app runs in `AUTH_MODE=static`
(default) until you set up an Auth0 tenant and flip the mode.

In `AUTH_MODE=static`, the existing NUQE_API_TOKEN Bearer + X-Org-Id header
path continues to work exactly as before. No change to the static dev workflow.

In `AUTH_MODE=auth0`, the X-Org-Id header is ignored entirely. The org UUID is
resolved from the `org_id` claim inside the verified JWT.

---

## Step 1: Create Auth0 tenant

- Sign up at auth0.com, create tenant in **EU region**
- Enable Organizations feature (left nav → Organizations)

---

## Step 2: Create an API

- APIs → Create API
- Name: **Nuqe Engine API**
- Identifier (audience): `https://api.nuqe.io`  ← set AUTH0_AUDIENCE to this
- Signing Algorithm: **RS256**

---

## Step 3: Create a Regular Web Application (for user tokens)

- Applications → Create Application → Regular Web Application
- Enable Organizations
- Note the **Domain** (AUTH0_DOMAIN), Client ID, Client Secret

---

## Step 4: Create an M2M Application (for lender system integrations)

- Applications → Create Application → Machine to Machine
- Authorize against the Nuqe Engine API
- Assign to the relevant Organization

---

## Step 5: Create an Organization

- Organizations → Create Organization
- Note the **Organization ID** (`org_xxx...`) — this maps to `organisations.auth0_org_id`
- Add members

---

## Step 6: Wire the org_id claim for M2M tokens

Auth0 M2M tokens do not automatically include the `org_id` claim. Use an Auth0 Action:

- Actions → Flows → **Client Credentials**
- Add action that sets:

```javascript
exports.onExecuteCredentialsExchange = async (event, api) => {
  if (event.organization) {
    api.accessToken.setCustomClaim("org_id", event.organization.id);
  }
};
```

This makes M2M tokens carry the same `org_id` claim as user tokens.

---

## Step 7: Set environment variables

```bash
AUTH_MODE=auth0
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://api.nuqe.io
```

Optional tuning:

```bash
AUTH0_ALGORITHMS=RS256          # default; do not change
AUTH0_JWKS_CACHE_TTL_SECONDS=3600  # default 1 hour
```

---

## Step 8: Map organisations.auth0_org_id

Run once to link the Auth0 org to the internal pilot org row:

```sql
UPDATE nuqe_engine.organisations
SET auth0_org_id = 'org_xxx...'
WHERE slug = 'pilot';
```

If the column does not yet exist, add it:

```sql
ALTER TABLE nuqe_engine.organisations
ADD COLUMN IF NOT EXISTS auth0_org_id TEXT UNIQUE;
```

---

## Step 9: Test with a real token

```bash
# Get an M2M token via client credentials
curl -s -X POST https://your-tenant.eu.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "<m2m_client_id>",
    "client_secret": "<m2m_client_secret>",
    "audience": "https://api.nuqe.io",
    "grant_type": "client_credentials",
    "organization": "org_xxx..."
  }' | jq -r .access_token

# Use the token (no X-Org-Id needed — org resolved from JWT)
curl -X POST http://localhost:8000/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "complaint_received",
    "case_id": "...",
    "occurred_at": "2026-05-15T09:00:00Z",
    "context": {"jurisdiction": "UK"}
  }'
```

---

## Minting a local test JWT (offline dev, no Auth0)

See `tests/api/test_auth0.py` — the `_make_token` helper generates RS256 tokens
signed with a local RSA key. Use `AUTH_MODE=auth0` + mock JWKS for offline
integration testing. The test RSA keypair is generated fresh per test session
(scope="module") and is never written to disk.

---

## Rollback: revert to AUTH_MODE=static

Simply unset or change the env var:

```bash
AUTH_MODE=static  # or remove it entirely (static is the default)
```

No code changes needed. The static Bearer token path is preserved until F3.5.

---

## pgbouncer note

If pgbouncer is added, it MUST be in **transaction mode** or **session mode**.
Statement mode is unsafe with `SET LOCAL` (used for RLS org context).
See `docs/pool_mode_constraints.md`.

---

## Architecture: how the auth flow works

```
Request → FastAPI
  → current_principal dependency
      → AUTH_MODE=static?
          → verify NUQE_API_TOKEN (hmac.compare_digest)
          → read X-Org-Id header → org_id UUID
          → return AuthenticatedPrincipal(sub="static-token", ...)
      → AUTH_MODE=auth0?
          → extract Bearer token
          → _get_jwks_client(domain) → cached PyJWKClient
          → get_signing_key_from_jwt(token) → RSA public key
          → jwt.decode(algorithms=["RS256"]) → claims
          → claims["org_id"] → auth0_org_id
          → resolve_org(auth0_org_id, conn) → internal UUID
          → return AuthenticatedPrincipal(sub=claims["sub"], ...)
  → Router receives AuthenticatedPrincipal
      → org_id = principal.org_id
      → actor = principal.sub  (written to all audit entries)
      → engine.process_event(org_id, event, actor)
```

---

## Security properties

| Property | Status |
|----------|--------|
| Algorithm confusion (HS256) | Blocked — `algorithms=["RS256"]` enforced in `jwt.decode` |
| JWKS key rotation | Automatic — PyJWKClient re-fetches on kid miss |
| Timing oracle on token compare | N/A for JWT (asymmetric verify, not compare) |
| org_id spoofing | Closed — org resolved from signed JWT claim, not from header |
| Audit actor spoofing | Closed — actor = JWT sub, not caller-supplied |
| JWKS cache poisoning | Low risk — singleton keyed by domain; TTL=1h |
