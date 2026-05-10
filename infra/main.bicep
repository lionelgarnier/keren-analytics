// Keren Analytics — Phase A Azure deployment (ADR 0004).
//
// Provisions everything required to host the public demo on
// Azure Container Apps West Europe with MS Founders Hub credits:
//   - Log Analytics workspace (required by the Container Apps env)
//   - Azure Container Apps environment (consumption / scale-to-zero)
//   - Container App `keren-analytics-app` (min 0 / max 3, port 3000)
//   - Azure Container Registry (Basic SKU)
//   - Key Vault (RBAC-authorized) for SESSION_SECRET + AZURE_CLIENT_SECRET
//   - User-assigned managed identity used by the Container App for
//     ACR pulls and Key Vault secret resolution
//
// Custom domain (`analytics.keren.run`) is bound only when the
// `customDomainName` parameter is non-empty AND the CNAME has been
// pre-validated. First deploy: leave empty, configure DNS once the
// FQDN is known, then re-deploy with the parameter set.
//
// Secret VALUES are seeded manually after the first deploy via
// `az keyvault secret set` — they are never committed.

targetScope = 'resourceGroup'

@description('Base name reused as the prefix for every resource.')
param appName string = 'keren-analytics'

@description('Azure region. West Europe to match MS Founders Hub credits.')
param location string = resourceGroup().location

@description('Container image tag. Injected by the deploy workflow.')
param imageTag string = 'latest'

@description('Custom domain bound to the Container App. Leave empty until the CNAME is in place.')
param customDomainName string = ''

@description('Min replicas. Keep at 0 for scale-to-zero on the demo.')
@minValue(0)
@maxValue(10)
param minReplicas int = 0

@description('Max replicas during traffic spikes.')
@minValue(1)
@maxValue(10)
param maxReplicas int = 3

@description('Tenant ID issuing OAuth tokens for the end-user Entra app. Default `organizations` = multi-tenant work accounts.')
param azureTenantIdParam string = 'organizations'

var acrName = toLower(replace('${appName}acr', '-', ''))
var logWorkspaceName = '${appName}-logs'
var environmentName = '${appName}-env'
var containerAppName = '${appName}-app'
var keyVaultName = take(toLower(replace('${appName}-kv', '-', '')), 24)
var managedIdentityName = '${appName}-mi'

var sessionSecretName = 'session-secret'
var azureClientSecretName = 'azure-client-secret'

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
}

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// AcrPull on the registry → managed identity can pull images.
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, managedIdentity.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    // 7f951dda-4ed3-4680-a7ca-43fe172d538d = AcrPull built-in role
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: false
    publicNetworkAccess: 'Enabled'
  }
}

// Key Vault Secrets User on the vault → managed identity can read secrets.
resource kvSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    // 4633458b-17de-408a-b874-0445c86b69e6 = Key Vault Secrets User
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: '${containerRegistry.name}.azurecr.io'
          identity: managedIdentity.id
        }
      ]
      secrets: [
        {
          name: sessionSecretName
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${sessionSecretName}'
          identity: managedIdentity.id
        }
        {
          name: azureClientSecretName
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${azureClientSecretName}'
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: '${containerRegistry.name}.azurecr.io/${appName}:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_MODE', value: 'real' }
            { name: 'CLOUD_PROVIDER', value: 'azure' }
            { name: 'AZURE_TENANT_ID', value: azureTenantIdParam }
            { name: 'SESSION_SECRET', secretRef: sessionSecretName }
            { name: 'AZURE_CLIENT_SECRET', secretRef: azureClientSecretName }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/auth/session'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    acrPullRoleAssignment
    kvSecretsUserRoleAssignment
  ]
}

// Custom domain binding — only attempted when the param is non-empty.
// Managed cert provisioning requires the CNAME to already resolve to the
// Container App FQDN, so leave empty on the first deploy.
resource customDomainBinding 'Microsoft.App/containerApps/customDomains@2024-03-01' = if (!empty(customDomainName)) {
  parent: containerApp
  name: customDomainName
  properties: {
    bindingType: 'ManagedCertificate'
  }
}

output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output keyVaultName string = keyVault.name
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
