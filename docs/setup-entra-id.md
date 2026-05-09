# Setting Up Entra ID (Azure AD) for Keren Analytics

> **Who is this guide for?**
> The **operator** — the person hosting Keren Analytics on a server (you,
> running it on Render / a VM / Docker on a NAS / your laptop). You do
> this **once for the whole instance**, not once per user.
>
> If you are an **end user** opening Keren Analytics in your browser
> (the public demo URL or a colleague's hosted instance), you do **not**
> need any of this. Just click *"Connect your Azure"* and sign in with
> your normal Microsoft account. The first sign-in from your tenant may
> show a one-time consent screen ("This app wants to read your Azure
> resources on your behalf"); a single click and you're in. If your
> tenant restricts user-consent, an admin needs to consent once for the
> whole org — same UX as Slack, Loom, Notion.

This guide walks you, the operator, through registering an app in
Microsoft Entra ID so that Keren Analytics can authenticate users via
SSO and query their Azure telemetry on their behalf.

## What end users see (no setup required)

```
Visitor opens https://<your-host>/
  → clicks "Connect your Azure"
  → redirected to login.microsoftonline.com
  → signs in (whatever auth their org uses — password, MFA, Windows Hello)
  → consent screen the first time (one click)
  → returned to Keren Analytics
  → discovers their Application Insights resources, sees their dashboard
```

That's it. No app to register on their side, no secret to manage, no
permission to configure. The token issued is **delegated** — Easy
Analytics acts on the user's behalf with the permissions they already
have, never with elevated rights.

## Quick start (operator, recommended)

Three commands instead of seven portal clicks. Requires the Azure CLI and a
recent `az login`.

```bash
# 1. Sign in to the tenant where you want the app registration to live.
az login

# 2. Provision the app registration + secret + delegated permission.
./deploy/azure-app-registration.sh \
  --redirect-uri http://localhost:3000/auth/callback

# 3. Copy the printed env vars into .env, then start Keren Analytics.
docker compose up -d
```

The script is idempotent: re-runs reuse the existing app registration and
append a fresh secret. Pass `--display-name` or `--secret-years` to customize.

What it does and does NOT do is documented at the top of
[`deploy/azure-app-registration.sh`](../deploy/azure-app-registration.sh).
Notably it does NOT grant admin consent and does NOT assign the per-user RBAC
roles; those still live on the IAM blade ([Step 6](#step-6-assign-azure-rbac-roles)
below).

## Manual setup (operator fallback)

Use this section if you cannot run the Azure CLI, or if your tenant requires
clicks to be performed by a different role than the one the script is running
under.

**Time required:** 5-10 minutes. **You do this once for the whole hosted
instance.** Your end users never see this page.

### Prerequisites

- An Azure account with access to Entra ID (Azure Active Directory)
- Admin consent rights (or an admin who can grant consent)
- The Keren Analytics server running locally or deployed

## Step 1: Register the Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory)
3. Click **App registrations** in the left menu
4. Click **+ New registration**
5. Fill in:
   - **Name:** `Keren Analytics` (or any name you prefer)
   - **Supported account types:** Select **Accounts in any organizational directory** (multi-tenant)
   - **Redirect URI:**
     - Platform: **Web**
     - URI: `http://localhost:3000/auth/callback` (or your deployed URL)
6. Click **Register**

## Step 2: Note the Application (Client) ID

After registration, you'll be on the app's overview page.

1. Copy the **Application (client) ID** -- you'll need this for `AZURE_CLIENT_ID`
2. Copy the **Directory (tenant) ID** if you want to restrict to a single tenant

## Step 3: Create a Client Secret

1. In the left menu, click **Certificates & secrets**
2. Click **+ New client secret**
3. Description: `Keren Analytics` (or any label)
4. Expiry: Choose based on your needs (recommended: 12 months)
5. Click **Add**
6. **Immediately copy the Value** (it won't be shown again) -- this is `AZURE_CLIENT_SECRET`

## Step 4: Configure API Permissions

1. In the left menu, click **API permissions**
2. Click **+ Add a permission**
3. Select **APIs my organization uses**
4. Search for and select **Azure Service Management**
5. Select **Delegated permissions**
6. Check **user_impersonation**
7. Click **Add permissions**
8. (Optional but recommended) Click **Grant admin consent for [your organization]**

## Step 5: Configure Keren Analytics

Add the following to your `.env` file (or environment variables):

```env
AZURE_MODE=real
AZURE_CLIENT_ID=<your-application-client-id>
AZURE_CLIENT_SECRET=<your-client-secret-value>
AZURE_REDIRECT_URI=http://localhost:3000/auth/callback
AZURE_TENANT_ID=organizations
SESSION_SECRET=<a-random-secure-string>
```

**Notes:**
- `AZURE_TENANT_ID=organizations` allows any work/school account to sign in
- Change to a specific tenant ID to restrict access to your organization only
- For production, set `AZURE_REDIRECT_URI` to your public URL

## Step 6: RBAC roles (per end user, one time per user)

The Entra ID app registration above lets users *sign in*. Whether each
signed-in user can actually see data is governed by **Azure RBAC roles
on their own subscription/workspace** — not by the app registration.

The signed-in user needs these roles on the Azure resources they want
to analyze:

| Role | Scope | Why |
|------|-------|-----|
| **Reader** | Subscription | To discover App Insights resources |
| **Log Analytics Reader** | Workspace | To run KQL queries on telemetry data |

In a typical engagement most engineers and PMs already have Reader on
their team's subscription, so step 6 is a no-op for them. New users
who only had Contributor on a single resource may need the workspace
Reader role granted.

To assign roles:
1. Go to the Azure Portal
2. Navigate to the **Subscription** > **Access control (IAM)**
3. Click **+ Add** > **Add role assignment**
4. Select **Reader** role, assign to the user
5. Repeat for the **Log Analytics workspace** with **Log Analytics Reader** role

## Step 7: Start and Test

```bash
npm run dev
```

Open http://localhost:3000 and click **Sign in with Microsoft**.

## Troubleshooting

### "AADSTS65001: The user or admin has not consented"
- Go back to Step 4 and click "Grant admin consent"
- Or ask your Azure admin to grant consent

### "AADSTS700016: Application not found"
- Double-check your `AZURE_CLIENT_ID` matches the registered app
- Ensure the app registration is in the correct tenant

### "Authorization_RequestDenied" on discovery
- The user needs **Reader** role on the subscription (Step 6)
- Check Access control (IAM) on the subscription

### "Forbidden" on dashboard queries
- The user needs **Log Analytics Reader** on the workspace (Step 6)
- Check the workspace's Access control (IAM)

### Token expires during use
- Keren Analytics auto-refreshes tokens when they're about to expire
- If refresh fails, you'll be prompted to sign in again
- Ensure your app registration includes **offline_access** in the scope (this is set by default)

## Docker Deployment

When deploying with Docker, pass the credentials as environment variables:

```bash
docker compose up -d \
  -e AZURE_MODE=real \
  -e AZURE_CLIENT_ID=<your-client-id> \
  -e AZURE_CLIENT_SECRET=<your-secret> \
  -e AZURE_REDIRECT_URI=https://your-domain.com/auth/callback \
  -e SESSION_SECRET=<random-string>
```

Or create a `.env` file and run:

```bash
docker compose up -d
```
