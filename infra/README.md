# `infra/` — Azure deployment (Phase A)

Bicep template that provisions the demo on **Azure Container Apps West Europe**
per [ADR 0004](../docs/adr/0004-azure-first-reversal.md).

## What it provisions

In the resource group `keren-analytics-prod` (West Europe by default):

- User-assigned managed identity (`keren-analytics-mi`)
- Log Analytics workspace (`keren-analytics-logs`) — required by Container Apps
- Azure Container Registry, Basic SKU, **admin user disabled** — pulls happen
  via `AcrPull` on the managed identity (no admin password)
- Key Vault (RBAC-authorized) — managed identity gets `Key Vault Secrets User`
- Container Apps environment + Container App `keren-analytics-app`
  - port 3000, scale 0 → 3 replicas, liveness probe on `/auth/session`
  - secrets `SESSION_SECRET` and `AZURE_CLIENT_SECRET` resolved from
    Key Vault at runtime via the managed identity

## First deploy (one-time, by the maintainer)

The GitHub Actions workflow at `.github/workflows/deploy-azure.yml` runs
this template on every push to `main`. The first manual run still has to
seed the Key Vault secrets and (later) bind the custom domain.

```bash
RG=keren-analytics-prod
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters imageTag=$(git rev-parse --short HEAD)
```

Once the deployment succeeds, capture the outputs and seed the secrets
**out of band** (they are never committed):

```bash
KV=$(az deployment group show -g "$RG" -n main --query 'properties.outputs.keyVaultName.value' -o tsv)

# 32-byte random session secret
az keyvault secret set --vault-name "$KV" --name session-secret \
  --value "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# End-user Entra app client secret (same value as the GitHub Actions secret today)
az keyvault secret set --vault-name "$KV" --name azure-client-secret --value "<paste>"
```

## Custom domain (`analytics.keren.run`)

Container Apps managed certificates require the CNAME to resolve **before**
the binding succeeds, so the first deploy intentionally leaves
`customDomainName` empty:

1. First deploy completes → grab `containerAppFqdn` from outputs.
2. Add a CNAME `analytics → <containerAppFqdn>` at the registrar
   (Namecheap), wait for propagation.
3. Re-deploy with `--parameters customDomainName=analytics.keren.run`.
   The managed cert provisions automatically once the domain is verified.

## Re-runs

The deployment is idempotent (`Incremental` mode is the default for
`az deployment group create`). The workflow re-runs it on every `main`
push; only the `imageTag` parameter changes between runs.
