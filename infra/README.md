# `infra/` — Azure deployment (Phase A)

Bicep template that provisions the demo on **Azure Container Apps France Central**
per [ADR 0004](../docs/adr/0004-azure-first-reversal.md).

## What it provisions

In the resource group `keren-analytics-prod` (France Central):

- User-assigned managed identity (`id-keren-analytics`) with `AcrPull` on the registry
- Log Analytics workspace (`la-keren-analytics`) — required by Container Apps
- Azure Container Registry, Basic SKU, **admin user disabled** — pulls happen
  via the managed identity (no admin password)
- Container Apps environment (`cae-keren-analytics`)
- Container App (`ca-keren-analytics`)
  - port 3000, scale via params, liveness probe on `/healthz`
  - secrets `SESSION_SECRET` and `AZURE_CLIENT_SECRET` are inline Container App
    secrets passed via `@secure()` Bicep params (encrypted at rest by Azure).
    Key Vault is intentionally **not** in V1 — adding a KV secret reference at
    Container App provisioning time creates a chicken-and-egg with the secret
    not yet existing. Layer KV on later if rotation/audit becomes a hard
    requirement.

ACR + Container App + env names use a `uniqueString(resourceGroup().id)` suffix
where Azure-global uniqueness matters (ACR), so the deployment is reproducible
in a fresh subscription without collisions.

## First deploy (one-time, by the maintainer)

The convenience wrapper at [`deploy/azure-deploy.sh`](../deploy/azure-deploy.sh)
takes care of:

1. registering required Azure resource providers (`Microsoft.App`,
   `Microsoft.OperationalInsights`, `Microsoft.ContainerRegistry`,
   `Microsoft.ManagedIdentity`);
2. generating / reusing a stable `SESSION_SECRET` cached at
   `deploy/.session-secret` (gitignored — delete to rotate);
3. detecting the Container App's existing image so re-runs don't regress to
   the placeholder hello-world;
4. running `az deployment group create` against this template;
5. building + pushing the Docker image and `az containerapp update --image`.

```bash
./deploy/azure-deploy.sh \
  --client-id "<AZURE_CLIENT_ID from azure-app-registration.sh>" \
  --client-secret "<AZURE_CLIENT_SECRET>"
```

A bare `az deployment group create` works too, for infra-only changes:

```bash
az deployment group create \
  --resource-group keren-analytics-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters \
    azureClientId=<...> \
    azureClientSecret=<...> \
    sessionSecret=<...>
```

## Per-push image deploys (CI)

`.github/workflows/deploy-azure.yml` does the lighter image-only path on
every push to `main`: build → push to ACR → `az containerapp update --image`.
It does **not** re-run the Bicep template — that path is reserved for infra
changes and runs only via `azure-deploy.sh` or manual `az deployment group
create`. Bootstrapped once via [`deploy/azure-ci-setup.sh`](../deploy/azure-ci-setup.sh)
(creates a CI-only Entra app + OIDC federated credential + minimal RBAC:
`AcrPush` on the registry, `Contributor` on the Container App).

## Custom domain (`analytics.keren.run`)

Custom-domain binding is a manual one-shot, not part of the template (Container
Apps managed certificates require the CNAME to resolve before the binding
succeeds, and Bicep does not handle the wait gracefully):

1. After the first deploy, get the FQDN:
   `az containerapp show -n ca-keren-analytics -g keren-analytics-prod --query properties.configuration.ingress.fqdn -o tsv`
2. Add `CNAME analytics → <FQDN>` and `TXT asuid.analytics → <validation-hash>`
   at the registrar (the validation hash is printed by
   `az containerapp hostname add ... --hostname analytics.keren.run`).
3. Wait for propagation (`dig @8.8.8.8 asuid.analytics.keren.run TXT`).
4. `az containerapp hostname add` then `az containerapp hostname bind` (managed
   cert is provisioned automatically by Let's Encrypt via Azure).
5. Update the Entra app registration with the production redirect URI:
   `./deploy/azure-app-registration.sh --redirect-uri "https://analytics.keren.run/auth/callback"`
6. Update the Container App env: `az containerapp update --set-env-vars AZURE_REDIRECT_URI=https://analytics.keren.run/auth/callback`.

## Re-runs

The deployment is idempotent (Bicep `Incremental` mode is the default). The
deploy script and the workflow are both safe to re-run.
