#!/usr/bin/env bash
#
# Provisions the Microsoft Entra ID app registration that backs Easy
# Analytics OAuth, in a single command. Replaces the 7 manual portal
# steps documented in docs/setup-entra-id.md.
#
# Usage:
#   ./deploy/azure-app-registration.sh \
#     [--display-name NAME] \
#     [--redirect-uri URL]  \
#     [--secret-years N]
#
# Prerequisites:
#   - Azure CLI (az --version >= 2.50).
#   - Signed in: `az login`. You need permission to create app
#     registrations in the target tenant — usually the
#     "Application Developer" Entra ID role or higher.
#
# What it does:
#   1. Creates (or reuses) a multi-tenant app registration.
#   2. Adds the redirect URI on the Web platform.
#   3. Adds delegated permission: Azure Service Management → user_impersonation.
#   4. Mints a fresh client secret (appended, existing secrets preserved).
#   5. Prints the env vars Keren Analytics needs.
#
# What it does NOT do:
#   - Grant admin consent (organization-level action; ask your Entra
#     admin if your tenant enforces it).
#   - Assign Azure RBAC roles (Reader, Log Analytics Reader). Those
#     live on the subscription/workspace IAM blade and are per-user.

set -euo pipefail

DISPLAY_NAME="keren-analytics"
REDIRECT_URI="http://localhost:3000/auth/callback"
SECRET_YEARS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --display-name) DISPLAY_NAME="$2"; shift 2 ;;
    --redirect-uri) REDIRECT_URI="$2"; shift 2 ;;
    --secret-years) SECRET_YEARS="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v az >/dev/null 2>&1 || {
  echo "ERROR: 'az' CLI not found in PATH. See https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
}
az account show >/dev/null 2>&1 || {
  echo "ERROR: not signed in to Azure. Run 'az login' first." >&2
  exit 1
}

APP_ID=$(az ad app list --display-name "$DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)

if [[ -z "${APP_ID}" ]]; then
  echo "Creating app registration '${DISPLAY_NAME}'..."
  APP_ID=$(az ad app create \
    --display-name "$DISPLAY_NAME" \
    --sign-in-audience AzureADMultipleOrgs \
    --web-redirect-uris "$REDIRECT_URI" \
    --query appId -o tsv)
else
  echo "Reusing existing app registration '${DISPLAY_NAME}' (appId=${APP_ID})."
  EXISTING_URIS=$(az ad app show --id "$APP_ID" --query "web.redirectUris" -o tsv 2>/dev/null || true)
  if ! grep -qFx "$REDIRECT_URI" <<<"$EXISTING_URIS"; then
    # Merge + dedupe so this script is safe to re-run with a different URI.
    UNIQUE_URIS=$(printf "%s\n%s\n" "$EXISTING_URIS" "$REDIRECT_URI" | grep -v '^$' | sort -u)
    # shellcheck disable=SC2086
    az ad app update --id "$APP_ID" --web-redirect-uris $UNIQUE_URIS
  fi
fi

# Well-known Microsoft constants — see
# https://learn.microsoft.com/azure/active-directory/manage-apps/application-list#well-known-app-ids
ARM_APP_ID="797f4846-ba00-4fd7-ba43-dac1f8f63013"
ARM_USER_IMPERSONATION_SCOPE="41094075-9dad-400e-a0bd-54e686782033"

echo "Ensuring Azure Service Management delegated permission..."
az ad app permission add \
  --id "$APP_ID" \
  --api "$ARM_APP_ID" \
  --api-permissions "${ARM_USER_IMPERSONATION_SCOPE}=Scope" \
  >/dev/null 2>&1 || true

# Compute secret expiry — works on both GNU date (Linux) and BSD date (macOS).
END_DATE=$(date -u -d "+${SECRET_YEARS} years" +%Y-%m-%d 2>/dev/null \
        || date -u -v+"${SECRET_YEARS}"y +%Y-%m-%d)

echo "Creating client secret (expires ${END_DATE})..."
SECRET=$(az ad app credential reset \
  --id "$APP_ID" \
  --display-name "keren-analytics-$(date -u +%Y%m%d)" \
  --end-date "$END_DATE" \
  --append \
  --query password -o tsv)

SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null \
              || head -c 64 /dev/urandom | base64 | tr -d '\n=+/' | head -c 64)

cat <<EOF

Done. App registration is ready.

Paste the following into your .env file (or export as environment variables):

  AZURE_MODE=real
  AZURE_CLIENT_ID=${APP_ID}
  AZURE_CLIENT_SECRET=${SECRET}
  AZURE_REDIRECT_URI=${REDIRECT_URI}
  AZURE_TENANT_ID=organizations
  SESSION_SECRET=${SESSION_SECRET}

If your organization enforces admin consent, ask an Entra admin to:
  open '${DISPLAY_NAME}' in the Entra ID portal → API permissions →
  click "Grant admin consent for <org>".

Each signed-in user also needs (per subscription / workspace):
  - Reader on the subscription (so Keren Analytics can discover App Insights)
  - Log Analytics Reader on the workspace (so it can run KQL queries)
EOF
