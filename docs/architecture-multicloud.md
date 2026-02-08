# Architecture Decision: Multi-Cloud Abstraction

## Status
ACCEPTED - Design phase. Azure implementation exists. AWS/GCP planned.

## Context

Easy Analytics starts with Azure (Application Insights + Log Analytics) but aims
to support AWS (CloudWatch, X-Ray) and GCP (Cloud Logging, Cloud Trace) in the
future. The architecture must anticipate multi-cloud from day one without adding
premature complexity.

## Decision

Introduce a **Cloud Provider Interface** that abstracts all cloud-specific
operations behind a unified contract. The current `getAzureClient()` factory
pattern in `src/azure/client.js` already follows this approach and serves as the
foundation.

## Architecture

### Provider Interface Contract

Every cloud provider adapter must implement this interface:

```javascript
/**
 * CloudProvider interface contract.
 * Each provider (Azure, AWS, GCP) must implement all methods.
 */
const CloudProviderInterface = {
  /** Unique provider identifier */
  provider: "azure" | "aws" | "gcp",

  /**
   * Discover available telemetry resources for the tenant.
   * @param {string} tenantId
   * @returns {Promise<Resource[]>}
   */
  discoverResources(tenantId) {},

  /**
   * Check if the current credentials have sufficient access.
   * @param {string} resourceId
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  checkAccess(resourceId) {},

  /**
   * Execute an analytics query against the telemetry store.
   * @param {QueryParams} params
   * @returns {Promise<QueryResult>}
   */
  queryWorkspace(params) {},

  /**
   * Return the readiness probe query for this provider.
   * @returns {string} - Provider-specific query text
   */
  getReadinessQuery() {},

  /**
   * Return available signal types for this provider.
   * @returns {string[]} - e.g., ["pageViews", "requests", "traces"]
   */
  getSupportedSignals() {},
};
```

### Unified Resource Model

```javascript
/**
 * Normalized resource representation across all providers.
 */
const Resource = {
  /** Cloud provider */
  provider: "azure",
  /** Provider-specific resource ID */
  resourceId: "/subscriptions/.../microsoft.insights/components/myapp",
  /** Human-readable name */
  name: "My Application",
  /** Provider-specific workspace/log group/project ID */
  workspaceId: "workspace-guid",
  /** Additional provider-specific metadata */
  metadata: {},
};
```

### Unified Query Result Model

```javascript
/**
 * Normalized query result. All providers must return this format.
 * This is already the format used by the Azure client (Log Analytics API format).
 */
const QueryResult = {
  tables: [
    {
      columns: [{ name: "column1", type: "string" }],
      rows: [["value1"]],
    },
  ],
};
```

### Directory Structure (Target)

```
src/
  providers/
    interface.js          # Shared interface definition and validation
    factory.js            # Provider factory (replaces current azure/client.js)
    azure/
      client.js           # Azure real client (current realClient.js)
      mockClient.js       # Azure mock client (current mockClient.js)
      mockData.js         # Azure mock data
      queryAdapter.js     # Translates generic queries to KQL
    aws/
      client.js           # AWS real client (CloudWatch + X-Ray)
      mockClient.js       # AWS mock client
      queryAdapter.js     # Translates generic queries to CloudWatch Insights
    gcp/
      client.js           # GCP real client (Cloud Logging + Trace)
      mockClient.js       # GCP mock client
      queryAdapter.js     # Translates generic queries to GCP log queries
  core/
    (unchanged - provider-agnostic orchestration)
  queries/
    azure/                # KQL templates (current kql/ folder)
    aws/                  # CloudWatch Insights queries
    gcp/                  # GCP log queries
```

### Migration Path from Current Architecture

The current code already uses the right pattern. The migration is incremental:

**Step 1 - Formalize the interface** (no breaking changes)
- Extract the implicit interface from `mockClient.js` and `realClient.js`
- Add `provider` field to resources
- Move `src/azure/` to `src/providers/azure/`
- Update `client.js` factory to support provider selection

**Step 2 - Add query abstraction**
- Create a query adapter layer that maps generic query names to provider-specific
  query languages (KQL for Azure, CloudWatch Insights for AWS, etc.)
- The current KQL templates become the Azure-specific implementation

**Step 3 - Implement AWS provider**
- Implement the CloudProvider interface for AWS
- Map Application Insights signals to CloudWatch equivalents:

| Azure Signal | AWS Equivalent |
|-------------|----------------|
| pageViews | CloudWatch RUM events |
| requests | X-Ray traces / ALB access logs |
| exceptions | CloudWatch Logs (error level) |
| dependencies | X-Ray subsegments |
| browserTimings | CloudWatch RUM performance |
| customEvents | Custom CloudWatch metrics / events |

**Step 4 - Implement GCP provider**
- Same pattern as AWS
- Map to Cloud Logging, Cloud Trace, and Cloud Monitoring

### Authentication per Provider

| Provider | Auth Method | Token Storage |
|----------|------------|---------------|
| Azure | Entra ID OAuth + PKCE | Session (current) |
| AWS | IAM Identity Center / Assume Role | Session |
| GCP | Google OAuth + Workload Identity | Session |

Each provider handles its own auth flow, but the session management is shared.

## Mapping Implications

The current mapping logic (`src/core/mapping.js`) uses Azure-specific field names
(e.g., `user_AuthenticatedId`, `session_Id`). For multi-cloud support:

1. The mapping layer needs a provider-specific field resolver
2. The canonical mapping remains the same (userId, sessionId, pagePath, etc.)
3. Each provider adapter translates canonical field names to provider-specific ones

```
Canonical Field    Azure                    AWS                     GCP
---------------------------------------------------------------------------
userId             user_AuthenticatedId     cognitoIdentityId       user_id
sessionId          session_Id               sessionId               session_id
pagePath           url.Path                 eventType=pageView.url  httpRequest.requestUrl
userAgent          client_Browser           userAgent               userAgent
```

## Key Design Principles

1. **Core stays cloud-agnostic** : The orchestrator, dashboard builder, cache, and
   readiness logic never import provider-specific code directly.
2. **Providers are self-contained** : Each provider directory contains everything
   needed (client, mock, queries, field mapping).
3. **Incremental adoption** : Adding a new provider doesn't require changing core code.
4. **Mock-first development** : Every provider has a mock client for development
   and testing.
5. **Same UX across clouds** : The dashboard looks identical regardless of provider.
   Users don't need to know which cloud is backing the data.

## Consequences

- Azure remains the only implemented provider for now
- The abstraction adds a thin layer but no runtime overhead
- AWS and GCP connectors can be developed independently
- The query template system must support multiple query languages
- Mapping and readiness logic must be parameterized by provider

## Timeline

- **Q1 2026** : Formalize interface, refactor directory structure (non-breaking)
- **Q3 2026** : AWS CloudWatch connector (beta)
- **Q4 2026** : GCP Cloud Logging connector (beta)
