#!/usr/bin/env bash
#
# One-time setup for the GitHub Actions OIDC deploy workflow.
#
# Creates a dedicated Entra ID app registration for the CI pipeline (separate
# from the user-facing OAuth app — so a CI secret rotation can't break user
# logins, and so the CI principal has the minimum RBAC it needs).
#
# What it does (idempotent):
#   1. Creates / reuses an app registration named keren-analytics-ci.
#   2. Creates / reuses an OIDC federated credential for
#      repo:OWNER/REPO:ref:refs/heads/main (no client secret = no rotation).
#   3. Grants the CI service principal:
#        - AcrPush on the ACR (push images)
#        - Contributor on the Container App (update revisions)
#   4. Prints the three values to paste as GitHub repository secrets.
#
# Re-running is safe: existing app/federated credential/role assignments are
# detected and reused.

set -euo pipefail

# --- Defaults (override via flags) ---
RESOURCE_GROUP="keren-analytics-prod"
APP_DISPLAY_NAME="keren-analytics-ci"
GITHUB_OWNER="lionelgarnier"
GITHUB_REPO="keren-analytics"
GITHUB_BRANCH="main"
CONTAINER_APP_NAME="ca-keren-analytics"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --resource-group <name>      Default: keren-analytics-prod
  --display-name <name>        Default: keren-analytics-ci
  --owner <github-org-or-user> Default: lionelgarnier
  --repo <repo-name>           Default: keren-analytics
  --branch <branch>            Default: main
  --container-app <name>       Default: ca-keren-analytics
  -h, --help                   Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)  RESOURCE_GROUP="$2"; shift 2 ;;
    --display-name)    APP_DISPLAY_NAME="$2"; shift 2 ;;
    --owner)           GITHUB_OWNER="$2"; shift 2 ;;
    --repo)            GITHUB_REPO="$2"; shift 2 ;;
    --branch)          GITHUB_BRANCH="$2"; shift 2 ;;
    --container-app)   CONTAINER_APP_NAME="$2"; shift 2 ;;
    -h|--help)         usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

command -v az >/dev/null || { echo "ERROR: az CLI not found." >&2; exit 1; }
az account show >/dev/null 2>&1 || { echo "ERROR: not signed in. Run 'az login'." >&2; exit 1; }

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# --- 1. App registration ---
APP_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)
if [[ -z "$APP_ID" ]]; then
  echo "Creating CI app registration '${APP_DISPLAY_NAME}'..."
  APP_ID=$(az ad app create --display-name "$APP_DISPLAY_NAME" --query appId -o tsv)
else
  echo "Reusing existing CI app registration '${APP_DISPLAY_NAME}' (appId=${APP_ID})."
fi

# Service principal (needed for role assignments).
SP_ID=$(az ad sp list --filter "appId eq '${APP_ID}'" --query "[0].id" -o tsv 2>/dev/null || true)
if [[ -z "$SP_ID" ]]; then
  echo "Creating service principal for ${APP_DISPLAY_NAME}..."
  SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
fi

# --- 2. Federated credential (OIDC, no client secret) ---
FC_NAME="github-${GITHUB_OWNER}-${GITHUB_REPO}-${GITHUB_BRANCH}"
FC_SUBJECT="repo:${GITHUB_OWNER}/${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}"

EXISTING_FC=$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='${FC_NAME}'].name" -o tsv 2>/dev/null || true)
if [[ -z "$EXISTING_FC" ]]; then
  echo "Creating federated credential '${FC_NAME}' (subject: ${FC_SUBJECT})..."
  az ad app federated-credential create --id "$APP_ID" --parameters "$(cat <<EOF
{
  "name": "${FC_NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "${FC_SUBJECT}",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions deploy on push to ${GITHUB_BRANCH}"
}
EOF
)" >/dev/null
else
  echo "Reusing existing federated credential '${FC_NAME}'."
fi

# --- 3. RBAC ---

# Find the ACR in the RG (we deployed exactly one).
ACR_ID=$(az resource list -g "$RESOURCE_GROUP" --resource-type Microsoft.ContainerRegistry/registries --query "[0].id" -o tsv 2>/dev/null || true)
[[ -n "$ACR_ID" ]] || { echo "ERROR: no ACR found in '${RESOURCE_GROUP}'. Run azure-deploy.sh first." >&2; exit 1; }

# Container App ID for scoping the Contributor role.
CONTAINER_APP_ID=$(az containerapp show -n "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" --query id -o tsv 2>/dev/null || true)
[[ -n "$CONTAINER_APP_ID" ]] || { echo "ERROR: Container App '${CONTAINER_APP_NAME}' not found." >&2; exit 1; }

# Use role names rather than GUIDs — Azure CLI strips dashes from raw GUID
# values, which can collide with the role's bare-id form and intermittently
# fail with "RoleDefinitionDoesNotExist". Names resolve unambiguously.
assign_role_idempotent() {
  local scope="$1" role_name="$2"
  if az role assignment list --assignee "$APP_ID" --scope "$scope" --role "$role_name" --query "[0].id" -o tsv 2>/dev/null | grep -q .; then
    echo "Reusing existing ${role_name} role assignment on $(basename "$scope")."
  else
    echo "Granting ${role_name} on $(basename "$scope")..."
    # Retry briefly: a freshly created SP takes a few seconds to be queryable.
    for i in 1 2 3 4 5; do
      if az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
                                   --role "$role_name" --scope "$scope" --output none 2>/dev/null; then
        return 0
      fi
      sleep 5
    done
    echo "ERROR: could not assign ${role_name} after retries." >&2
    exit 1
  fi
}

assign_role_idempotent "$ACR_ID"           "AcrPush"
assign_role_idempotent "$CONTAINER_APP_ID" "Contributor"

# --- 4. Outputs ---
cat <<EOF

=== Done ===

Add these three secrets in GitHub:
  Settings → Secrets and variables → Actions → New repository secret

  AZURE_CLIENT_ID        = ${APP_ID}
  AZURE_TENANT_ID        = ${TENANT_ID}
  AZURE_SUBSCRIPTION_ID  = ${SUBSCRIPTION_ID}

Or paste these one-liners:
  gh secret set AZURE_CLIENT_ID       --body "${APP_ID}"
  gh secret set AZURE_TENANT_ID       --body "${TENANT_ID}"
  gh secret set AZURE_SUBSCRIPTION_ID --body "${SUBSCRIPTION_ID}"

After that, push to '${GITHUB_BRANCH}' or trigger workflow_dispatch on
.github/workflows/deploy-azure.yml — the workflow signs in via OIDC (no
secret to rotate), builds, pushes to ACR, and updates the Container App.
EOF
