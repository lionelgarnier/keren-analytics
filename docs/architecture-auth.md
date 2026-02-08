# Architecture Decision: Authentication vs. Data Access

## Status
ACCEPTED - Current implementation uses coupled auth. Decoupled design planned.

## The Question

The current `AZURE_CLIENT_ID` serves **two purposes at once**:

1. **Authentication** (identity): Who is the user? (name, email, tenant)
2. **Data access** (authorization): Can this user query Azure Log Analytics?

When the user clicks "Sign in with Microsoft", Entra ID returns a token that
contains both their identity AND delegated permissions to call Azure Management
APIs. This is why one click gives both auth and data — they're the same token.

```
Current flow (coupled):

  User clicks "Sign in"
        |
        v
  Entra ID OAuth (AZURE_CLIENT_ID)
        |
        v
  Token = identity + Azure Management API access
        |
        +---> Who is the user? (name, email, tenant ID)
        +---> Query Log Analytics on behalf of user (delegated permissions)
```

## Why It's Coupled Today

This was a deliberate choice for the Azure-first MVP:

- **One click** = authenticated + data access. Zero friction.
- **No credentials to store** — the user's own RBAC controls what they see.
- **No service principal needed** — works with the user's existing permissions.
- **Security** — delegated access means Easy Analytics never has more access
  than the signed-in user.

For an Azure-only product, this is the optimal design.

## Why It Needs to Be Decoupled (for multi-cloud and growth)

The coupled design breaks in several scenarios:

### 1. Multi-cloud users
An AWS user has no Entra ID. They can't sign in via Microsoft to query CloudWatch.
They need a separate identity provider (Google, email/password, SSO) and then
connect their AWS account separately.

### 2. Non-technical users (marketing PMs)
A marketing PM might not have Azure RBAC permissions, but a platform engineer
could share a read-only dashboard link. That PM needs to authenticate (identity)
without having direct Azure access.

### 3. Platform/SaaS model
If Easy Analytics becomes a SaaS product, users sign up with email and then
connect one or more cloud accounts. Auth and data access must be decoupled.

### 4. Multiple cloud accounts
A user might want to see dashboards from both their Azure AND AWS environments
in one session. They need one identity but multiple data access tokens.

## Target Architecture: Decoupled

```
Target flow (decoupled):

  Layer 1: Identity (who are you?)
  ================================
  User signs in via:
    - Entra ID (Azure users — fast path, also gives data access)
    - Google OAuth (GCP users)
    - Email + password (via Supabase/Firebase/Auth0)
    - Any OIDC/SAML provider (enterprise SSO)
        |
        v
  Session established (user identity stored)

  Layer 2: Cloud Connection (what can you access?)
  =================================================
  User connects cloud account(s):
    - Azure: OAuth with Azure Management scope (reuses Entra token if available)
    - AWS: IAM role assumption or Identity Center
    - GCP: Google OAuth with Cloud Logging scope
        |
        v
  Cloud tokens stored in session (per-provider)
```

### Key Principle: Azure Fast Path

For Azure users, the experience stays exactly the same — one click. But
architecturally, it's modeled as two steps that happen to complete in one:

```
Azure fast path:
  Entra ID sign-in
    → identity established (Layer 1)
    → Azure token available (Layer 2 — automatic, same token)
    → Dashboard loads immediately

Non-Azure path:
  Google/email sign-in
    → identity established (Layer 1)
    → "Connect your cloud" prompt (Layer 2 — separate step)
    → User authorizes AWS/GCP/Azure
    → Dashboard loads
```

## Implementation Plan

### Phase 1 (current): Coupled Entra ID
- `AZURE_CLIENT_ID` handles both auth and data access
- Works perfectly for Azure-only users
- No changes needed

### Phase 2: Add identity abstraction
- Introduce an `AuthProvider` interface alongside `CloudProvider`
- Add support for a generic OIDC provider (e.g., Supabase, Firebase, Auth0)
- Keep Entra ID as the default and "fast path"
- Session stores: `{ identity, cloudConnections: [{ provider, token }] }`

### Phase 3: Multi-provider connections
- User can connect multiple cloud accounts to one identity
- Each cloud connection has its own OAuth flow and token lifecycle
- Dashboard shows a unified view across connected providers

## Auth Provider Comparison

| Provider | Pros | Cons | Best For |
|----------|------|------|----------|
| **Entra ID** (current) | One-click auth+data for Azure, enterprise SSO | Azure-only users | Azure-first product |
| **Supabase** | Open source, Postgres-backed, easy to self-host, row-level security | Another service to manage | Multi-cloud SaaS, indie/startup |
| **Firebase Auth** | Free tier, many providers, Google ecosystem | Google lock-in, less control | Quick setup, mobile-first |
| **Auth0** | Enterprise features, many providers, SAML | Expensive at scale, vendor lock-in | Enterprise SaaS |
| **Clerk** | Modern DX, React components, session management | Newer, less battle-tested | Modern SaaS with rich UI |
| **Custom OIDC** | Full control | Build everything yourself | When you need total control |

## My Recommendation

**Short term (now):** Keep Entra ID coupled. It's the right choice for the
Azure-first phase. The one-click experience is the main selling point.

**Medium term (multi-cloud):** Add **Supabase Auth** as the identity layer.

Why Supabase:
- Open source (can self-host if needed for enterprise)
- Built-in support for Azure AD, Google, GitHub, email+password
- Row-level security for future multi-tenant data
- Postgres-backed (aligns with Phase 3 Postgres migration)
- Free tier generous enough for early growth
- The Entra ID sign-in becomes one of many providers in Supabase,
  AND we detect when the provider is Azure to auto-connect data access

```
With Supabase:

  User signs in via Supabase Auth
    ├── Provider = Microsoft/Entra ID
    │     → identity + Azure token (fast path preserved!)
    ├── Provider = Google
    │     → identity only, then "Connect AWS/GCP" prompt
    └── Provider = Email
          → identity only, then "Connect your cloud" prompt
```

This preserves the Azure fast path while enabling all other scenarios.

**Long term:** Evaluate Auth0 or Clerk if enterprise SSO (SAML, SCIM) becomes
a hard requirement, since they handle that out of the box.

## Config Evolution

```
# Phase 1 (current)
AZURE_CLIENT_ID=xxx          # Auth + Data access (coupled)

# Phase 2 (decoupled)
AUTH_PROVIDER=supabase        # Identity layer
SUPABASE_URL=xxx
SUPABASE_ANON_KEY=xxx
AZURE_CLIENT_ID=xxx          # Data access only (cloud connection)
AWS_ROLE_ARN=xxx              # Data access for AWS
GCP_CLIENT_ID=xxx             # Data access for GCP
```

## Consequences

- The current code doesn't need to change yet
- When multi-cloud or non-Azure auth is needed, add the identity abstraction
- The Azure fast path is preserved in all scenarios
- The `AZURE_CLIENT_ID` shifts from "auth + data" to "data access only"
- A new auth layer handles identity across all providers
