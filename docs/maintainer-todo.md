# Maintainer TODO — actions hors-code

This file tracks work that requires the maintainer (Lionel) personally —
because it needs credentials, GitHub Settings access, third-party
accounts, design work, or author voice. Claude Code agents update this
file when they discover a new manual dependency, but they cannot tick
items off.

Format: each item has **what**, **why**, **when needed**, **how**, and
links to the agent-side work that depends on it.

---

## 1. Production environment & secrets

### `SESSION_SECRET` (production)
- **Why**: `src/config.js` now throws at boot if `NODE_ENV=production`
  and `SESSION_SECRET` is missing or set to a known placeholder.
- **How (effectif sur Azure)** : `deploy/azure-deploy.sh` génère un secret
  (32 bytes hex via `openssl rand`) et le persiste dans
  `deploy/.session-secret` (gitignoré). Re-déploiements réutilisent ce
  fichier, donc les sessions actives ne sont pas invalidées. Pour rotater :
  supprimer `deploy/.session-secret` et relancer le script. Le secret est
  passé au Bicep en `@secure() param` puis au Container App en `secret`
  chiffré au repos.
- **Status**: DONE — 2026-05-10.

### Entra ID app registration (real Azure mode)
- **Why**: required for `AZURE_MODE=real`. Mock mode does not need it.
- **When**: only if you want the public demo to also let visitors
  connect their own Azure tenant. The Show-HN-friendly demo can ship
  in mock mode first.
- **How**: `docs/setup-entra-id.md` walks through it; A6 added a
  one-command Bicep registration. Outputs:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_REDIRECT_URI` (must match the deployed origin)
  - `AZURE_TENANT_ID` (`organizations` for multi-tenant work accounts)
- **Status**: TODO. Optional for the OSS-first launch.

### Demo deploy target
- **Why**: the Show HN / Reddit launch needs a clickable URL.
- **When**: launch eve.
- **How**: post-ADR 0004 the demo target is **Azure Container Apps West
  Europe** (`keren-analytics-prod`), provisioned by `infra/main.bicep`
  via `.github/workflows/deploy-azure.yml`. The `render.yaml` blueprint
  remains in-repo as a self-host hint but is no longer the demo target.
  URL: `https://analytics.keren.run` (DNS step below).
- **Status**: TODO.

### Launch-week scaling policy (`minReplicas=1`, `maxReplicas=1`)
- **Why**: sessions are in-memory (`express-session` default store). For launch
  reliability, keep a single replica and avoid cold starts.
- **When**: launch week (before public traffic), then reassess after launch.
- **How**: keep `infra/main.parameters.json` at `minReplicas=1`,
  `maxReplicas=1` for the launch deployment. After launch, if you re-enable
  scale-out, ship a shared session store first.
- **Status**: TODO.

### First Azure deploy + Key Vault secret seeding
- **Why**: the Bicep template provisions an empty Key Vault. The Container
  App boots with `secretRef`s pointing to `session-secret` and
  `azure-client-secret` — those secrets must exist before the app starts
  successfully.
- **When**: right after the first run of `deploy-azure.yml`.
- **How**: see `infra/README.md` § "First deploy" — generate a 32-byte
  random `session-secret` and paste the end-user Entra app
  `azure-client-secret` via `az keyvault secret set`. Key Vault name is
  in the workflow / Bicep outputs. Never commit values.
- **Status**: TODO.

### CNAME `analytics.keren.run` → Container App FQDN
- **Why**: the managed certificate for the custom domain only provisions
  once the CNAME already resolves.
- **When**: after the first successful Azure deploy, before launch.
- **What actually happened** (2026-05-10/11):
  CNAME was configured at Namecheap, the managed certificate
  `mc-cae-keren-anal-analytics-keren--4208` was created on the
  Container Apps environment via portal/CLI, and the binding +
  redirect URI override were applied directly on the live Container
  App. None of this lives in [`infra/main.bicep`](../infra/main.bicep)
  yet — see the follow-up entry below.
- **Status**: DONE — `https://analytics.keren.run` serves the app with
  a valid TLS cert.

### Bicep ↔ prod drift on custom domain + redirect URI
- **Why this existed**: discovered 2026-05-11 during the Track F5 what-if
  for the Foundry env vars push. Three configurations live on the
  production Container App that were **not represented** in
  [`infra/main.bicep`](../infra/main.bicep):
  1. `properties.configuration.ingress.customDomains[0]` — binding for
     `analytics.keren.run` to managed cert
     `mc-cae-keren-anal-analytics-keren--4208`.
  2. The managed cert resource itself on the Container Apps environment.
  3. `AZURE_REDIRECT_URI=https://analytics.keren.run/auth/callback` env
     var.
- **Risk that existed**: anyone running `./deploy/azure-deploy.sh`
  against prod regressed OAuth + broke the custom domain. The image-only
  CI workflow (`.github/workflows/deploy-azure.yml`) did **not**
  redeploy Bicep so it stayed safe.
- **Status**: DONE — 2026-05-13 — option 1 (lift into Bicep) shipped.
  Changes:
  - Two new params on `infra/main.bicep`: `customDomainName` (defaults
    to `analytics.keren.run` via `infra/main.parameters.json`) and
    `customDomainCertificateName` (defaults to
    `mc-cae-keren-anal-analytics-keren--4208`). The cert is referenced
    by name rather than created (cert provisioning depends on DNS
    being live, which isn't expressible in pure IaC) — fresh
    environments must create the cert out-of-band before running
    Bicep, then plug the name in.
  - `containerApp.properties.configuration.ingress.customDomains` now
    binds the custom domain to the existing cert when both params are
    set.
  - New `effectiveRedirectUri` variable: explicit `azureRedirectUri`
    override > `https://<customDomainName>/auth/callback` > empty
    (deploy script patches with the FQDN only when neither is set).
    Container App env var `AZURE_REDIRECT_URI` is wired to this.
  - `deploy/azure-deploy.sh` reads the new `effectiveRedirectUri`
    output and **no longer clobbers** AZURE_REDIRECT_URI when Bicep
    has filled it in. New `--custom-domain` / `--custom-domain-cert`
    flags let staging environments override the prod defaults.
  - Two new outputs (`effectiveRedirectUri`, `customDomainConfigured`)
    so future scripts / CI can introspect the binding without re-querying.
- **Re-run safety**: confirmed via inspection — re-running
  `./deploy/azure-deploy.sh` against prod with the default params will
  preserve `AZURE_REDIRECT_URI=https://analytics.keren.run/auth/callback`
  and the custom-domain binding. A what-if dry-run before the next deploy
  is still good hygiene.

---

## 2. GitHub repo Settings (not file-tracked)

These need a human to click through `Settings` on
`github.com/lionelgarnier/keren-analytics`:

### About / topics / website / description
- **Why**: HN/Reddit visitors pattern-match on these in the first 5s.
- **Status**: DONE — 2026-05-10. Description :
  *"Plug-and-play Marketing & Technical dashboards for Azure App Insights —
  AI-mapped schema, KQL-only, MIT."* (102 chars). Homepage :
  `https://analytics.keren.run`. Topics (10) : `analytics`,
  `application-insights`, `azure`, `dashboard`, `express`, `kql`,
  `marketing-analytics`, `nodejs`, `oss`, `self-hosted`. Tout posé via
  `gh repo edit` + `gh api` ; modifiable au besoin.

### Pin v0.1.0 release with notes
- **Why**: the right-hand sidebar's "Releases: v0.1.0" is a strong
  signal of "this is real software, not a weekend hack".
- **Status**: DONE — 2026-05-10. Tag `v0.1.0` créé sur le HEAD `ed561a7`,
  release publiée avec les notes du `[0.1.0]` de `CHANGELOG.md`, marquée
  *Latest* (donc auto-épinglée dans le sidebar). URL :
  https://github.com/lionelgarnier/keren-analytics/releases/tag/v0.1.0

### Issue + PR templates UI check
- **Why**: the `.github/ISSUE_TEMPLATE/*.yml` and
  `.github/PULL_REQUEST_TEMPLATE.md` files are now in place; worth
  opening `New issue` and `Compare/PR` once to verify they render.
- **Status**: TODO (1 minute).

### Branch protection on `main`
- **Why**: prevents accidental force-push to the deployed branch.
- **Blocker**: GitHub limite la branch protection avancée aux repos publics
  (gratuit) ou GitHub Pro privés ($4/mo). Le repo est privé pour l'instant
  → activation différée jusqu'au passage en public (cf. launch-strategy
  § 10 *"Do not pre-announce"*, qui plaide pour rendre public le jour J).
- **How (à exécuter le jour du launch, juste après `gh repo edit --visibility public`)** :
  ```bash
  cat <<'JSON' | gh api repos/lionelgarnier/keren-analytics/branches/main/protection -X PUT --input -
  {
    "required_status_checks": {"strict": true, "contexts": ["Tests", "Security audit"]},
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  JSON
  ```
- **Status**: TODO — déblocable au passage public.

---

### Default `AI_PROVIDER` for the public demo
- **Why**: `docs/architecture-ai.md` introduces a provider abstraction
  (`none` / `ollama` / `azure-openai`). The public demo has to pick one.
  Each option has cost / quality / privacy trade-offs that are a maintainer
  call, not an agent call. See § 7 of `launch-strategy.md` for the budget
  cap and the architecture doc § "Deployment patterns" for the matrix.
- **When**: before the demo URL goes live (overlaps with the demo deploy
  target item above).
- **How**: pick one and set the env var on Render / the deploy target.
  Recommended for first launch: `none` (zero infra cost, canned narration
  on the demo, fits the budget). Switch to `ollama` post-launch if the
  AI angle needs to feel "alive" and a small CPU instance covers it.
  Avoid `azure-openai` on the public demo unless a Microsoft sponsorship
  covers the bill — pay-per-visitor is incompatible with a HN spike.
- **Status**: TODO. Blocks demo deploy.

## 3. Third-party accounts (launch-day infrastructure)

### Plausible / Umami (D5 launch-day analytics)
- **Why**: track HN / Reddit / Twitter source attribution and
  conversion to GitHub stars during the launch window.
- **How**: self-host Umami on the same Render account, or use Plausible
  Cloud (€9/mo). Embed the script in the landing page only (not the
  dashboard — we don't want to phone home from the analytics product).
  The landing page (`public/index.html`) has an HTML-comment slot near
  the bottom of the `#landingPage` section marking where the snippet
  goes; the footer copy already promises "no tracking by default" so
  please don't add it site-wide.
- **Status**: TODO. Blocked on D5.

### Domain registrar (note for the runbook)
- **Why**: `docs/launch-day-runbook.md` Contacts section needs to know
  which registrar holds the demo domain so you can transfer / change
  nameservers under stress.
- **How**: write the registrar name + login URL into the runbook's
  Contacts section before launch eve. Keep credentials in your
  password manager, not in the repo.
- **Status**: TODO.

### Cloudflare in front of the demo (E2)
- **Why**: caches static assets, absorbs the HN front-page spike, gives
  a status page if Render goes down.
- **How**: free tier; point DNS at Cloudflare, set Render origin as
  pull, cache `*.svg`, `*.css`, `*.js`, `*.png` aggressively.
- **Status**: TODO. STRONG, not BLOCKER.

### BetterStack status page (E3, OPTIONAL)
- **Why**: "we're aware" beats silence during an outage.
- **How**: free tier, link from the demo footer.
- **Status**: TODO.

### Docker Hub / GHCR
- **Why**: published image enables the Docker-pull-count badge and the
  one-line `docker run` quickstart.
- **How**: GitHub Action that builds + pushes on tag (`v*`); a manual
  first push to claim the namespace.
- **Status**: TODO. Tied to A6.

---

## 4. Author-voice content (Claude can draft, you must approve / publish)

These can be drafted by Claude but the final voice and the *publish*
action are yours.

### D1 — Show HN post
- **What**: title + 4-6 paragraph body, including the pre-written
  founder-comment for the predictable "but Azure portal already does X"
  objection.
- **Status**: not drafted yet.

### D2 — Reddit posts (r/azure, r/devops, r/selfhosted)
- **What**: three different angles, one per subreddit. Lead with a
  concrete user pain, not "look at my project".
- **Status**: not drafted yet.

### D3 — dev.to / blog post (STRONG)
- **What**: 1500-2500 words, technical deep dive on the
  natural-language-to-KQL layer.
- **Status**: not drafted yet.

### D4 — Outreach list (10-15 named contacts)
- **What**: Microsoft MVPs in Azure data/devops, MS DevRel folks,
  Azure newsletter authors, maintainers of `Awesome-Azure` lists.
  Personalized 3-line DM ready to send post-launch.
- **Status**: not drafted yet. Claude can draft the DM template; the
  contact list is yours to assemble.

### D6 — Press kit (OPTIONAL)
- **What**: logo SVG + PNG, founder photo + bio, taglines, 3 product
  screenshots.
- **Status**: TODO. Design work; AI generation is a starting point but
  the logo at minimum should be hand-finalized.

### A4 — Open Graph image
- **What**: 1200×630 social-preview image rendered when the README /
  demo URL is shared. Must include the product name and a one-line
  pitch in legible-at-thumbnail-size type.
- **Status**: TODO.

### A3 — Hero GIF / video for README
- **What**: ≤ 15s screencast of the 2-minute setup → dashboard flow.
  README has a placeholder block (HTML comment) right under the tagline
  that should be replaced with `![hero](docs/assets/hero.gif)` once the
  asset lands. Same screencast doubles as the LinkedIn / Twitter /
  Show HN preview.
- **Status**: TODO. Needs Lionel to record from a real session.

### Inline screenshots in the README
- **What**: the "What's inside" bullet list in `README.md` has an HTML
  comment marking where one image per group would let the section
  breathe. Suggested shots: (1) Marketing tab with the narration panel
  + first-run banner + delta chips visible; (2) Readiness tab showing
  the 0–100 score + a couple of expanded prompt cards; (3) Technical
  tab with slow-endpoints table.
- **Status**: TODO. Pair with the press-kit work.

### Demo URL substitution
- **What**: README "Live demo" line currently says "_coming with the
  public launch — see docs/maintainer-todo.md_". Once A1 (demo URL
  stand-up) ships, replace that line with the real URL. Update the
  GitHub repo's "Website" field at the same time
  (Settings § GitHub repo polish).
- **Status**: TODO.

---

## 5. Reviewer-eyes pass (no creds, but needs you)

### CONTRIBUTING / CoC / SECURITY first-pass read
- **Why**: I (Claude) wrote those during C2 with the email
  `garniel6@gmail.com`. Worth one human pass to confirm the tone
  matches your voice and the email is the canonical one to keep.
- **Status**: TODO (≤ 5 min).

### `docs/launch-strategy.md` traction-gate review
- **Why**: Phase 3 (multi-tenant SaaS) and Phase 4 (multi-cloud) were
  originally gated on signals defined there. **Now superseded by ADR 0001**
  (portfolio pivot) — the SaaS gate is no longer the active decision.
  Multi-cloud becomes a primary deliverable, not a gated bet. Document
  kept as historical reference.
- **Status**: superseded — see `docs/adr/0001-positioning-portfolio.md`.

---

## 6. Pivot vitrine + retournement Azure-first (ADRs 0001-0004) — items à arbitrer / exécuter

### Renommer le projet en `keren-analytics`
- **Why**: ADR 0001 acte le repositionnement vitrine. Le suffixe `-for-azure`
  est redondant avec la tagline (qui reste *"plug-and-play analytics for
  Azure App Insights"* — cf. ADR 0004) et alourdit le nom de repo. `keren-analytics`
  signe le mainteneur via le domaine `keren.run` tout en restant neutre.
- **When**: avant la Phase A (refacto provider + déploiement Azure), pour
  éviter une cascade de renames.
- **How**: rename GitHub repo (`lionelgarnier/easy-analytics-for-azure` →
  `lionelgarnier/keren-analytics`, redirect GH auto), puis PR dédiée pour
  mettre à jour `package.json`, `README.md`, `public/index.html`, landing,
  toutes les références dans `docs/**/*.md`. Ne pas bundler avec un
  changement d'archi.
- **Status**: DONE — repo renamed + references updated in branch
  `claude/cloud-agnostic-architecture-fVCQx` (this commit).

### Microsoft for Startups Founders Hub — statut crédits Azure
- **Why**: ADR 0004 fait d'Azure Container Apps l'hôte de la démo, et ADR
  0005 ajoute l'inference Azure AI Foundry. Founders Hub couvre les deux,
  sans coût out-of-pocket pendant la phase pre-launch.
- **Status — 2026-05-11** :
  - **1 000 € de crédits Azure approuvés** — utilisables immédiatement.
  - **5 000 € supplémentaires en cours de validation** (montant total
    potentiel : 5k-150k$ sur 4 ans selon le niveau Founders Hub atteint).
  - Note importante pour les agents Claude : **ne pas redemander à chaque
    session si Founders Hub est fait** — la candidature est déposée et en
    cours. Le statut est mis à jour ici.
- **Once 5k€ approved** : récupérer subscription ID + sponsor reference,
  ajouter le badge "Microsoft for Startups" sur le README et la landing.
- **Pitch utilisé** : *"Keren Analytics is an MIT-licensed plug-and-play
  dashboard for Azure Application Insights with AI-powered setup wizard
  (audit + mapping + recommendations). Aimed at Azure dev teams frustrated
  by the portal UX. KQL-only, no raw data leaves the tenant. Hosting public
  demo on Azure Container Apps + Azure AI Foundry."*

### Provisionner Azure AI Foundry (Track F — ADR 0005)
- **Why**: ADR 0005 acte AI-first setup wizard pre-launch. Track F nécessite
  un endpoint Azure AI Foundry avec un model deployment pour le scan +
  AI mapping + recommendations.
- **When**: avant le démarrage de F3 (AI mapping service). F1 (SQLite) et F2
  (schema scan enrichi) peuvent commencer en parallèle sans le LLM.
- **What was actually done** (2026-05-11) :
  - Foundry Hub + Project `keren-analytics-prod` créés via portail.
  - Model `gpt-5.4-mini` (deployment `2026-03-17`) déployé — choix
    upgradé depuis `gpt-4o-mini` après inspection du catalogue, cf.
    addendum ADR 0005.
  - Endpoint format **projet Responses API** :
    `https://keren-analytics-prod-foundry.services.ai.azure.com/api/projects/keren-analytics-prod/openai/v1/responses`
  - Env vars en local (`.env`) : `AZURE_FOUNDRY_ENDPOINT` +
    `AZURE_FOUNDRY_DEPLOYMENT=gpt-5.4-mini`. Test bout-en-bout OK
    (HTTP 200, `pong`, 18 tokens — token audience `https://ai.azure.com/`).
- **What remains** :
  - Propagation des env vars dans `infra/main.bicep` (l'agent F3 le fait
    dans la PR de F3).
  - **Assignation du rôle MI** : entrée séparée ci-dessous (blocking F3
    en prod).
- **Quota TPM** : à vérifier dans le portail Foundry sur le deployment
  `gpt-5.4-mini`. Demander 100k+ TPM avant launch HN si on anticipe un
  spike Show HN.
- **Status**: PARTIAL — provisioning + dev local OK ; reste rôle MI + Bicep.

### Assigner le rôle `Azure AI User` à la MI du Container App (Track F3)
- **Why**: F3 appellera Foundry depuis le Container App via la Managed
  Identity (`uami-keren-analytics`). Sans le rôle `Azure AI User` sur le
  Project Foundry, l'inférence renverra `403 Forbidden` en prod. ADR 0005
  addendum 2026-05-11 corrige le rôle initialement listé
  (`Cognitive Services User` ne suffit pas pour l'endpoint projet).
- **When**: avant le **premier deploy de F3 en prod**. Pas bloquant pour
  le développement local (qui utilise le token `az` du mainteneur).
- **How** (Azure Portal, le plus simple) :
  1. Portal → AI Foundry → Project `keren-analytics-prod` → Access
     control (IAM) → Add role assignment.
  2. Role : **Azure AI User** (lecture + inférence). `Azure AI Developer`
     marche aussi mais donne plus que nécessaire.
  3. Assign to : **Managed Identity** → `id-keren-analytics` (la
     user-assigned MI déjà créée par `infra/main.bicep`,
     `var managedIdentityName = 'id-${namePrefix}'`).
  4. Review + assign.
- **How** (CLI alternative — vérifié 2026-05-11 contre la prod) :
  ```bash
  MI_PRINCIPAL_ID=$(az identity show -g keren-analytics-prod \
    -n id-keren-analytics --query principalId -o tsv)
  # Foundry est un Microsoft.CognitiveServices/accounts (kind=AIServices)
  # avec un sub-resource projects/<projectName>. Scope au projet pour
  # least-privilege ; scope au compte si tu veux que l'assignment couvre
  # de futurs projets sous le même Hub.
  PROJECT_ID=$(az resource show -g keren-analytics-prod \
    --name keren-analytics-prod-foundry/keren-analytics-prod \
    --resource-type Microsoft.CognitiveServices/accounts/projects \
    --query id -o tsv)
  az role assignment create --assignee-object-id "$MI_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Azure AI User" --scope "$PROJECT_ID"
  ```
- **Verify**: depuis le Container App, `curl` vers le Foundry endpoint
  doit renvoyer 200, pas 401/403. F3 expose une route healthcheck
  `/api/ai/ping` à utiliser pour ça.
- **Status**: DONE — 2026-05-13 — vérifié via
  `az role assignment list --assignee <MI principalId> --all`. Rôle
  `Azure AI User` assigné au scope
  `…/Microsoft.CognitiveServices/accounts/keren-analytics-prod-foundry`
  (scope compte plutôt que projet, ce qui couvre aussi les futurs
  projets sous le même Hub — léger sur-périmètre acceptable). La MI
  `id-keren-analytics` a également `AcrPull` sur le registry, comme
  prévu par `infra/main.bicep`.

### Wirer le backup SQLite en production (Track F1 — ADR 0005)
- **Why**: F1 a shippé `scripts/backup-sqlite.mjs` (VACUUM INTO + rotation 24
  snapshots vers `data/backups/`), mais rien ne le déclenche en prod. Sans
  cron + upload off-host, un redémarrage de Container App perd `data/keren.db`
  (tous les mappings, validations, scans).
- **What shipped (2026-05-13)**: option 2 (snapshot off-host vers Blob) en
  **in-process scheduler** plutôt qu'en Container Apps Job séparé. Un Job
  séparé n'a pas accès au filesystem de l'app (besoin d'un Azure Files mount
  partagé qui ralentit aussi les INSERT du wizard), donc le scheduler tourne
  directement dans le process Node — un `setInterval` horaire qui exécute
  `VACUUM INTO` vers un fichier temp puis `BlockBlobClient.uploadFile`.
  Auth via la MI déjà utilisée par Foundry (rôle `Storage Blob Data
  Contributor` ajouté sur le Storage Account dans Bicep).
  Code : [`src/core/backupScheduler.js`](../src/core/backupScheduler.js),
  câblé dans [`src/server.js`](../src/server.js) ; 7 tests dans
  [`tests/backupScheduler.test.js`](../tests/backupScheduler.test.js).
- **Trade-off accepté**: si l'app crash, plus de snapshot tant qu'elle n'est
  pas redémarrée (RPO ≤ 1h pendant un outage long). Pour le launch HN,
  acceptable : le wizard est idempotent (nouveau OAuth → re-scan gratuit),
  donc 1h de perte = nuisance UX, pas drame.
- **Bicep ressources ajoutées**: Storage Account `Standard_LRS` /
  StorageV2 (nom auto-généré `stkbk…<uniqueSuffix>`, max 24 chars), Blob
  container privé `sqlite-backups`, role assignment `Storage Blob Data
  Contributor` (GUID `ba92f5b4-2d11-453d-a403-e96b0029c9fe`) sur la MI
  `id-keren-analytics`. Env vars sur le Container App :
  `BACKUP_BLOB_ACCOUNT`, `BACKUP_BLOB_CONTAINER=sqlite-backups`,
  `BACKUP_INTERVAL_MS=3600000`, `BACKUP_MAX_SNAPSHOTS=24`.

#### À faire côté Azure pour activer en prod
1. **Re-déployer Bicep** une fois pour provisionner le Storage Account
   et l'attribution de rôle :
   ```bash
   ./deploy/azure-deploy.sh --client-id <GUID> --client-secret <secret> --skip-build
   ```
   (Le `--skip-build` évite de rebuilder l'image — on veut juste l'infra
   pour cette première passe. Bicep est idempotent : les ressources déjà
   provisionnées ne sont pas re-créées.)
2. **Récupérer le nom du Storage Account** depuis les outputs :
   ```bash
   az deployment group list -g keren-analytics-prod \
     --query "[?contains(name, 'keren-analytics-')] | [0].properties.outputs.storageAccountName.value" \
     -o tsv
   ```
3. **Vérifier que la MI peut bien écrire** (avant de pousser une image qui
   en dépend) :
   ```bash
   STORAGE_ACCOUNT=<output from step 2>
   az storage blob list --account-name "$STORAGE_ACCOUNT" \
     --container-name sqlite-backups --auth-mode login -o table
   ```
   Doit retourner une liste vide (pas une erreur 403). Si 403 →
   l'attribution de rôle n'a pas encore propagé (peut prendre 1-2 min).
4. **Pousser une nouvelle image** via le workflow OIDC GitHub Actions
   (`deploy-azure.yml`) ou en relançant `azure-deploy.sh` sans
   `--skip-build`. Le scheduler démarre au boot, premier snapshot
   ~60s après le démarrage du replica.
5. **Vérifier qu'un snapshot apparaît** au bout de quelques minutes :
   ```bash
   az storage blob list --account-name "$STORAGE_ACCOUNT" \
     --container-name sqlite-backups --auth-mode login -o table
   ```
   Doit montrer un blob `keren-2026-MM-DDTHH-MM-SS-mmmZ.db`. Les logs
   du Container App montrent aussi `[backup] uploaded keren-…` :
   ```bash
   az containerapp logs show -n ca-keren-analytics -g keren-analytics-prod \
     --tail 100 | grep backup
   ```

#### Restore (si jamais)
```bash
STORAGE_ACCOUNT=<from step 2 above>
# Pick a snapshot
az storage blob list --account-name "$STORAGE_ACCOUNT" \
  --container-name sqlite-backups --auth-mode login -o table
# Download it
az storage blob download --account-name "$STORAGE_ACCOUNT" \
  --container-name sqlite-backups --auth-mode login \
  --name keren-2026-05-13T10-00-00-000Z.db --file restored.db
# Copy into the Container App (or rebuild a revision with --bind it)
```
- **Status**: DONE — 2026-05-13 — code + Bicep shipped. Maintainer
  doit exécuter les 5 étapes ci-dessus pour activer en prod.

### Provisionner l'hébergement Azure de la démo
- **Why**: ADR 0004 § Decision 2 — Azure Container Apps. Région retenue :
  **France Central** (préférence souveraineté FR, latence ~5ms depuis Paris).
- **How (effectif)**: stack provisionné via Bicep dans
  [`infra/main.bicep`](../infra/main.bicep), orchestré par
  [`deploy/azure-deploy.sh`](../deploy/azure-deploy.sh). Composants :
  Log Analytics + Container Apps environment + Container App + Azure Container
  Registry (Basic) + User-assigned Managed Identity (AcrPull). **Pas de Key
  Vault dans le V1** : les secrets (SESSION_SECRET, AZURE_CLIENT_SECRET) sont
  passés directement comme Container App secrets via paramètres `@secure()`
  Bicep. Migration KV à layer en Phase B si rotation/audit deviennent un
  besoin réel.
- **Prereq découvert** : la subscription doit avoir le resource provider
  Microsoft.App enregistré. Si le premier déploiement échoue avec
  "Subscription is not registered for the Microsoft.App resource provider",
  exécuter une fois : `az provider register -n Microsoft.App --wait`.
- **Status**: DONE — 2026-05-10 — premier déploiement manuel réussi sur la
  subscription `0a3afaae-8849-4b27-8e43-dad3ba80ce58` (RG
  `keren-analytics-prod`, France Central). FQDN provisoire :
  `ca-keren-analytics.happyrock-d99ade88.francecentral.azurecontainerapps.io`.
  Coût observé : ~10-15 €/mois sans crédits Founders Hub (scale-to-zero
  Container App + ACR Basic + Log Analytics).

### Configurer GitHub Actions pour déployer sur Azure
- **Why**: ADR 0004 § Decision 4 — workflow `deploy-azure.yml` via OIDC
  federated credentials (pas de secret long-lived côté GH).
- **How (effectif)** : workflow file
  [`.github/workflows/deploy-azure.yml`](../.github/workflows/deploy-azure.yml)
  + script de setup
  [`deploy/azure-ci-setup.sh`](../deploy/azure-ci-setup.sh). Le script crée
  une app registration `keren-analytics-ci` dédiée (séparée de l'app
  `keren-analytics` qui sert l'OAuth utilisateur, pour éviter qu'une rotation
  CI casse l'OAuth), une federated credential OIDC pour
  `repo:lionelgarnier/keren-analytics:ref:refs/heads/main`, et assigne 2
  rôles RBAC minimaux : **AcrPush** sur l'ACR, **Contributor** sur le
  Container App (pas Contributor sur le RG entier — least privilege).
- **Steps maintainer (~5 min)** :
  1. `./deploy/azure-ci-setup.sh` (idempotent).
  2. Coller les 3 valeurs imprimées comme GitHub Secrets (Settings →
     Secrets and variables → Actions), ou utiliser les `gh secret set`
     one-liners imprimés par le script.
  3. Push sur `main` ou `gh workflow run deploy-azure.yml` pour déclencher.
  4. Le workflow build l'image, push à ACR, update le Container App, et
     attend la propagation healthy avant de finir.
- **Status**: workflow file en place 2026-05-10 ; reste les 2 actions
  maintainer (script CI + secrets) avant le premier run automatique.

### DNS `analytics.keren.run` pointé sur Azure
- **Why**: ADR 0002 § 7 (DNS maintenu par ADR 0004 § Decision 5) — l'URL
  canonique `https://analytics.keren.run` reste en place, seul l'endpoint
  cible change.
- **When**: déblocable depuis le 2026-05-10 — l'infra Azure est en place, le
  FQDN provisoire est `ca-keren-analytics.happyrock-d99ade88.francecentral.azurecontainerapps.io`.
- **How**:
  1. Récupérer le FQDN Azure Container Apps après déploiement (forme
     `<app>.<env>.francecentral.azurecontainerapps.io`).
  2. Chez le registrar de `keren.run`, créer un `CNAME analytics` → FQDN
     Azure. Vérifier le record `asuid.analytics` requis par Azure pour
     l'attache du custom domain.
  3. Activer le **managed certificate** Azure Container Apps pour
     `analytics.keren.run` (Let's Encrypt managé).
  4. Configurer la redirection apex `keren.run` → `analytics.keren.run`
     (chez le registrar si possible, sinon via un Cloudflare Worker
     gratuit ou un Azure Front Door Standard).
- **Status**: TODO.

### Mettre à jour `CLAUDE.md` après Phase A
- **Why**: `CLAUDE.md` mentionne encore "Phase 3/4 gated, do not start
  speculatively" et la stratégie originale OSS-first SaaS-track. Après
  ADRs 0001+0004, le bon récit est "Azure-first, vitrine portfolio,
  multi-cloud V2 conditionnel".
- **How**: remplacer la section "Status" et "Known gaps" par une référence
  aux ADRs 0001 et 0004. Garder le reste (invariants, conventions, mock
  parity, KQL templating, etc.) inchangé — ils tiennent toujours.
- **Status**: DONE — 2026-05-10 — section Status réécrite (Phase A DONE,
  ref ADRs 0001+0004), repo map ajoute `deploy/`, "metadataStore in-memory"
  corrigé en fs-backed, SESSION_SECRET fail-loud noté, "Render auto-deploys"
  remplacé par `deploy/azure-deploy.sh`.

### Purger le Key Vault orphelin du premier déploiement raté
- **Why**: lors du premier essai de Bicep le 2026-05-10, le Container App
  référençait des secrets KV qui n'existaient pas encore → échec. Bicep
  reformulé sans KV (secrets inline), mais le KV `kv-keren-analytics-dfrvt`
  créé pendant le run raté est resté dans le RG. Coût ~0 (pas de secrets,
  pas d'opérations) mais c'est du bruit dans le portail.
- **How**:
  ```bash
  az keyvault delete --name kv-keren-analytics-dfrvt -g keren-analytics-prod
  az keyvault purge  --name kv-keren-analytics-dfrvt --location francecentral
  ```
  (Le `purge` est nécessaire car KV reste 7j en soft-delete par défaut.)
- **Status**: TODO — 30 secondes, pas urgent.

### Gotcha — ne pas re-run `azure-app-registration.sh` inutilement
- **Why**: le script utilise `az ad app credential reset --append`, qui
  **mint un nouveau client secret à chaque run**. Les anciens secrets
  restent valides (le Container App tournant ne casse pas), mais ça pollue
  l'app registration et complique les audits. À ne lancer que pour :
  - Première création de l'app registration.
  - Ajouter une nouvelle redirect URI (le script dedupe correctement, donc
    re-run sûr quand un nouvel environnement apparaît, ex. URL Container
    Apps après premier déploiement).
  - Rotation explicite de secret.
- **Status**: note opérationnelle — pas un TODO.

### ~~Compte Scaleway + dossier Startup Program~~ — reporté V2
- ~~Why / How~~: superseded par ADR 0004 — l'hôte V1 est Azure, pas Scaleway.
  Le compte Scaleway et le dossier Startup Program redeviennent pertinents
  uniquement si la V2 multi-cloud est déclenchée (article portage
  Scaleway). Conservé ici pour mémoire, à réactiver le cas échéant.
- **Status**: deferred to V2 (post-traction).

### ~~Setup OpenTofu Scaleway + GH secrets Scaleway~~ — reporté V2
- ~~Why / How~~: superseded par ADR 0004 — V1 utilise Azure (Bicep ou
  `terraform/azure/`). Les secrets Scaleway ne sont pas créés tant que la
  V2 multi-cloud n'est pas activée.
- **Status**: deferred to V2 (post-traction).


---

## How agents update this file

- A new manual dependency surfaces in any track? Append it under the
  matching section, with all four fields (what / why / when / how) and
  a `**Status**: TODO` line.
- An item is no longer needed (e.g. we decided not to ship Cloudflare)?
  Strike it through with a one-line note explaining the decision —
  don't delete it, the trail is useful.
- An item gets done? The maintainer ticks it (changes `Status: TODO` to
  `Status: DONE — <date> — <commit/SHA or "manual">`); agents shouldn't
  flip it to DONE unless they actually executed the work.
