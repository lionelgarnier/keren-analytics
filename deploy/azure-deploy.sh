#!/usr/bin/env bash
#
# Bootstraps the Keren Analytics infra on Azure:
#   1. Creates / reuses the resource group.
#   2. Generates / reuses a stable SESSION_SECRET (cached at deploy/.session-secret).
#   3. Deploys infra/main.bicep with secrets passed as @secure() params.
#   4. Builds the Docker image, pushes to ACR, updates the Container App.
#   5. Prints the public FQDN.
#
# Re-runnable. SESSION_SECRET is preserved across re-deploys (delete
# deploy/.session-secret to force rotation, which invalidates active sessions).
#
# Prerequisites:
#   - az --version >= 2.60, signed in (az login).
#   - The Entra ID app registration already exists (run
#     deploy/azure-app-registration.sh first).
#   - Docker running locally (for build + push).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION_SECRET_FILE="$SCRIPT_DIR/.session-secret"
BICEP_FILE="$REPO_ROOT/infra/main.bicep"

# --- Defaults (override via flags) ---
RESOURCE_GROUP="keren-analytics-prod"
LOCATION="francecentral"
NAME_PREFIX="keren-analytics"
AZURE_CLIENT_ID=""
AZURE_CLIENT_SECRET=""
AZURE_TENANT_ID="organizations"
SKIP_BUILD=0
# Track F3 — AI Foundry. Defaults come from infra/main.parameters.json;
# CLI flags override them. Empty AI_PROVIDER (or "none") keeps the AI
# disabled in the Container App.
AI_PROVIDER=""
AZURE_FOUNDRY_ENDPOINT=""
AZURE_FOUNDRY_DEPLOYMENT=""

usage() {
  cat <<EOF
Usage: $0 --client-id <GUID> --client-secret <secret> [options]

Required:
  --client-id <GUID>           AZURE_CLIENT_ID from azure-app-registration.sh
  --client-secret <secret>     AZURE_CLIENT_SECRET from azure-app-registration.sh

Options:
  --resource-group <name>      Default: keren-analytics-prod
  --location <region>          Default: francecentral
  --name-prefix <prefix>       Default: keren-analytics (3-20 chars)
  --tenant <id>                Default: organizations (multi-tenant)
  --skip-build                 Skip docker build/push (re-deploy infra only)
  --ai-provider <none|azure-foundry>     Override AI_PROVIDER env var
  --foundry-endpoint <url>     Override AZURE_FOUNDRY_ENDPOINT env var
  --foundry-deployment <name>  Override AZURE_FOUNDRY_DEPLOYMENT env var
  -h, --help                   Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client-id)         AZURE_CLIENT_ID="$2"; shift 2 ;;
    --client-secret)     AZURE_CLIENT_SECRET="$2"; shift 2 ;;
    --resource-group)    RESOURCE_GROUP="$2"; shift 2 ;;
    --location)          LOCATION="$2"; shift 2 ;;
    --name-prefix)       NAME_PREFIX="$2"; shift 2 ;;
    --tenant)            AZURE_TENANT_ID="$2"; shift 2 ;;
    --skip-build)        SKIP_BUILD=1; shift ;;
    --ai-provider)       AI_PROVIDER="$2"; shift 2 ;;
    --foundry-endpoint)  AZURE_FOUNDRY_ENDPOINT="$2"; shift 2 ;;
    --foundry-deployment) AZURE_FOUNDRY_DEPLOYMENT="$2"; shift 2 ;;
    -h|--help)           usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$AZURE_CLIENT_ID" || -z "$AZURE_CLIENT_SECRET" ]]; then
  echo "ERROR: --client-id and --client-secret are required." >&2
  usage
  exit 2
fi

command -v az >/dev/null || { echo "ERROR: az CLI not found." >&2; exit 1; }
az account show >/dev/null 2>&1 || { echo "ERROR: not signed in. Run 'az login'." >&2; exit 1; }

if [[ $SKIP_BUILD -eq 0 ]]; then
  command -v docker >/dev/null || { echo "ERROR: docker not found (or pass --skip-build)." >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo "ERROR: docker daemon not running." >&2; exit 1; }
fi

# Generate or reuse the session secret.
if [[ -f "$SESSION_SECRET_FILE" ]]; then
  SESSION_SECRET=$(cat "$SESSION_SECRET_FILE")
  echo "Reusing cached SESSION_SECRET from ${SESSION_SECRET_FILE}"
else
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n=+/' | head -c 64)
  umask 077
  printf '%s' "$SESSION_SECRET" > "$SESSION_SECRET_FILE"
  echo "Generated new SESSION_SECRET → ${SESSION_SECRET_FILE} (delete to rotate)"
fi

SUB_NAME=$(az account show --query name -o tsv)
SUB_ID=$(az account show --query id -o tsv)

cat <<EOF

=== Deploying Keren Analytics infrastructure ===
  Subscription:  ${SUB_NAME} (${SUB_ID})
  Resource group: ${RESOURCE_GROUP}
  Location:       ${LOCATION}
  Name prefix:    ${NAME_PREFIX}

EOF
read -p "Proceed? [y/N] " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# --- 1. Resource group ---
echo "[1/4] Ensuring resource group '${RESOURCE_GROUP}' in ${LOCATION}..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Ensure required resource providers are registered (idempotent; non-blocking if already registered).
for prov in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.ManagedIdentity; do
  state=$(az provider show -n "$prov" --query registrationState -o tsv 2>/dev/null || echo "Unknown")
  if [[ "$state" != "Registered" ]]; then
    echo "    Registering $prov (was $state)..."
    az provider register -n "$prov" --wait --output none
  fi
done

# Detect the current Container App image so we don't regress to the Bicep placeholder
# during a re-deploy. On first deploy (no Container App yet), this is empty and Bicep
# falls back to its hello-world default.
EXISTING_IMAGE=$(az containerapp show -n "ca-${NAME_PREFIX}" -g "$RESOURCE_GROUP" --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "")
IMAGE_PARAMS=()
if [[ -n "$EXISTING_IMAGE" && "$EXISTING_IMAGE" != *"containerapps-helloworld"* ]]; then
  echo "    Reusing existing Container App image during Bicep deploy: $EXISTING_IMAGE"
  IMAGE_PARAMS=(containerImage="$EXISTING_IMAGE")
fi

# --- 2. Bicep deployment ---
echo "[2/4] Deploying Bicep (this takes 3-5 min on first run)..."
DEPLOY_NAME="keren-analytics-$(date -u +%Y%m%d-%H%M%S)"
FOUNDRY_PARAMS=()
if [[ -n "$AI_PROVIDER" ]];          then FOUNDRY_PARAMS+=(aiProvider="$AI_PROVIDER"); fi
if [[ -n "$AZURE_FOUNDRY_ENDPOINT" ]]; then FOUNDRY_PARAMS+=(azureFoundryEndpoint="$AZURE_FOUNDRY_ENDPOINT"); fi
if [[ -n "$AZURE_FOUNDRY_DEPLOYMENT" ]]; then FOUNDRY_PARAMS+=(azureFoundryDeployment="$AZURE_FOUNDRY_DEPLOYMENT"); fi

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOY_NAME" \
  --template-file "$BICEP_FILE" \
  --parameters "$REPO_ROOT/infra/main.parameters.json" \
  --parameters \
      namePrefix="$NAME_PREFIX" \
      azureClientId="$AZURE_CLIENT_ID" \
      azureClientSecret="$AZURE_CLIENT_SECRET" \
      azureTenantId="$AZURE_TENANT_ID" \
      sessionSecret="$SESSION_SECRET" \
      "${IMAGE_PARAMS[@]}" \
      "${FOUNDRY_PARAMS[@]}" \
  --output none

# Pull outputs.
OUTPUTS=$(az deployment group show --resource-group "$RESOURCE_GROUP" --name "$DEPLOY_NAME" --query properties.outputs -o json)
ACR_LOGIN_SERVER=$(echo "$OUTPUTS" | python3 -c "import json,sys;print(json.load(sys.stdin)['acrLoginServer']['value'])")
ACR_NAME=$(echo "$OUTPUTS" | python3 -c "import json,sys;print(json.load(sys.stdin)['acrName']['value'])")
APP_NAME=$(echo "$OUTPUTS" | python3 -c "import json,sys;print(json.load(sys.stdin)['containerAppName']['value'])")
APP_FQDN=$(echo "$OUTPUTS" | python3 -c "import json,sys;print(json.load(sys.stdin)['containerAppFqdn']['value'])")

echo "    ACR:           ${ACR_LOGIN_SERVER}"
echo "    Container App: ${APP_NAME}"
echo "    Public FQDN:   ${APP_FQDN}"

# --- 3. Build & push image ---
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "[3/4] Building and pushing Docker image to ${ACR_LOGIN_SERVER}..."
  az acr login --name "$ACR_NAME"
  IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d-%H%M%S)"
  IMAGE="${ACR_LOGIN_SERVER}/keren-analytics:${IMAGE_TAG}"
  docker build --platform linux/amd64 -t "$IMAGE" -t "${ACR_LOGIN_SERVER}/keren-analytics:latest" "$REPO_ROOT"
  docker push "$IMAGE"
  docker push "${ACR_LOGIN_SERVER}/keren-analytics:latest"

  # --- 4. Update Container App with the real image + final redirect URI ---
  echo "[4/4] Updating Container App with new image..."
  REDIRECT_URI="https://${APP_FQDN}/auth/callback"
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE" \
    --set-env-vars "AZURE_REDIRECT_URI=${REDIRECT_URI}" \
    --output none
else
  echo "[3/4] Skipping docker build (--skip-build)."
  echo "[4/4] Skipping container update."
  REDIRECT_URI="https://${APP_FQDN}/auth/callback"
fi

cat <<EOF

=== Done ===

Public URL:        https://${APP_FQDN}
Redirect URI:      ${REDIRECT_URI}

Next steps:
  1. Add the redirect URI to your Entra ID app registration:
       ./deploy/azure-app-registration.sh --redirect-uri "${REDIRECT_URI}"
     (Re-run safely; it dedupes redirect URIs.)
  2. Visit https://${APP_FQDN} and sign in to confirm OAuth works.
  3. (Later) configure custom domain analytics.keren.run — see
     docs/maintainer-todo.md § "DNS analytics.keren.run".

EOF
