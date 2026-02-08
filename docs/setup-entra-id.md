# Setting Up Entra ID (Azure AD) for Easy Analytics

This guide walks you through registering an app in Microsoft Entra ID so that
Easy Analytics can authenticate users via SSO and query their Azure telemetry.

**Time required:** 5-10 minutes

## Prerequisites

- An Azure account with access to Entra ID (Azure Active Directory)
- Admin consent rights (or an admin who can grant consent)
- The Easy Analytics server running locally or deployed

## Step 1: Register the Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory)
3. Click **App registrations** in the left menu
4. Click **+ New registration**
5. Fill in:
   - **Name:** `Easy Analytics` (or any name you prefer)
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
3. Description: `Easy Analytics` (or any label)
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

## Step 5: Configure Easy Analytics

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

## Step 6: Assign Azure RBAC Roles

The signed-in user needs these Azure roles to use Easy Analytics:

| Role | Scope | Why |
|------|-------|-----|
| **Reader** | Subscription | To discover App Insights resources |
| **Log Analytics Reader** | Workspace | To run KQL queries on telemetry data |

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
- Easy Analytics auto-refreshes tokens when they're about to expire
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
