# ADR 0003 — Déploiement "one-click" via Terraform/OpenTofu, par cloud

## Status

ACCEPTED — 2026-05-09. Dépend des ADR 0001 (vitrine multi-cloud) et 0002
(Scaleway primaire pour la démo).

## Context

L'ADR 0001 fait du multi-cloud le livrable principal de la vitrine. Pour que
ce soit réellement démontrable (pas un PowerPoint), un visiteur du repo doit
pouvoir, en quelques minutes :

1. **Forker** le repo,
2. **Choisir un cloud** (Azure / AWS / GCP / Scaleway),
3. **Lancer une commande** qui provisionne l'infra et déploie l'app,
4. **Recevoir une URL** fonctionnelle.

L'expérience cible est celle qu'on associe aux boutons "Deploy to Render"
ou "Deploy to Vercel" — sauf qu'ici elle existe pour 4 clouds, et elle
reste auditable (pas de magie SaaS opaque).

Trois options ont été comparées :

| Option | Avantages | Inconvénients |
|---|---|---|
| Scripts shell par cloud (`deploy/<cloud>.sh`) | Simple, lisible | Pas idempotent, pas d'état, drift invisible |
| Pulumi (TS/Python) | Langage complet | Adhérence à un runtime, lock-in léger sur Pulumi Cloud (state) |
| **Terraform / OpenTofu** | Standard de fait, providers officiels pour les 4 clouds, état explicite, déclaratif, auditable | Verbeux, learning curve HCL |

Terraform/OpenTofu est le standard de l'industrie pour ce cas d'usage, et son
caractère déclaratif aligne avec le pitch portfolio ("la même app décrite
4 fois, audit immédiat des différences entre clouds"). OpenTofu est préféré à
Terraform pour la licence (MPL vs. BSL) et reste 100% compatible côté HCL et
providers — mais on documente les deux, le lecteur choisit.

## Decision

### 1. Un dossier Terraform par cloud, isolé

```
terraform/
├── modules/                 # Modules réutilisables cross-cloud
│   ├── app-image/          # Build & push image OCI (logique commune)
│   └── secrets/            # Conventions de nommage des secrets
├── azure/                   # tofu apply ici → déploie sur Azure
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── README.md
├── aws/                     # idem AWS
├── gcp/                     # idem GCP
└── scaleway/                # idem Scaleway (V1, primaire pour la démo)
```

Règle stricte : **chaque dossier cloud est autosuffisant**. Pas de fichier
HCL monolithique multi-cloud (anti-pattern : fait exploser la complexité,
casse l'isolation).

### 2. Services ciblés par cloud (V1 par cloud)

| Couche | Scaleway (Phase A) | Azure (Phase B) | AWS (Phase C) | GCP (Phase C) |
|---|---|---|---|---|
| Compute | Serverless Container | Container Apps | App Runner | Cloud Run |
| Container Registry | Scaleway CR | ACR | ECR | Artifact Registry |
| Secrets | Scaleway Secret Manager | Key Vault | Secrets Manager | Secret Manager |
| DNS / TLS | Scaleway DNS + LE | Azure DNS + managed cert | Route53 + ACM | Cloud DNS + managed cert |

Choix communs aux 4 clouds : services **scale-to-zero** ou approchant, **OCI
standard**, **managed TLS**. Pas de Kubernetes (Coût ops disproportionné pour
une démo).

### 3. Pas de DB managée en V1

L'app est mono-tenant in-memory (cf. `CLAUDE.md` § "Known gaps"). Pas de
Managed PostgreSQL provisionné par défaut. **Quand** la persistence sera
ajoutée (Phase post-launch, hors scope ADR 0001), un module Terraform
optionnel `database/` sera ajouté par cloud (PG managé chez chacun).

### 4. Workflow "one-click" via GitHub Actions

```
.github/workflows/
├── ci.yml                   # Tests + build image (déjà existant à étendre)
├── deploy-scaleway.yml      # Phase A
├── deploy-azure.yml         # Phase B
├── deploy-aws.yml           # Phase C
└── deploy-gcp.yml           # Phase C
```

Chaque workflow :

1. Build l'image OCI (identique pour tous les clouds).
2. Push vers le registry du cloud cible.
3. `tofu apply` dans le dossier correspondant.
4. Output : URL publique du déploiement.

**Trigger** : `workflow_dispatch` (manuel) en V1, pour éviter qu'un push sur
`main` redéploie 4 clouds à chaque commit. Auto-deploy uniquement sur le
cloud de démo primaire (Scaleway).

### 5. Convention "fork & deploy" pour les visiteurs

README documente le flow visiteur :

```bash
# 1. Fork le repo
# 2. Configure les secrets dans Settings → Secrets → Actions
#    (un set par cloud que tu veux essayer)
# 3. Trigger le workflow correspondant via Actions UI
# 4. Récupère l'URL en sortie de workflow
```

Les secrets requis par cloud sont documentés dans
`terraform/<cloud>/README.md`. Pas de "Deploy to X" boutons en V1 (ils
existent pour Scaleway/Render/Heroku mais pas pour AWS/Azure/GCP de manière
homogène — un workflow GH Actions est plus universel et plus auditable).

### 6. État Terraform

- **V1** : state local + backup S3-compatible chiffré (Scaleway Object Storage
  par défaut, équivalent par cloud).
- **Pas de Terraform Cloud** (lock-in, payant au-delà du free tier).
- Le state contient potentiellement des secrets — chiffrement at-rest
  obligatoire, jamais committé.

### 7. OpenTofu vs Terraform

- Documentation et CI utilisent `tofu` par défaut (licence MPL, communautaire).
- Compatibilité 100% HCL : `terraform apply` fonctionne aussi.
- `.tool-versions` (asdf) ou `mise.toml` pour pin la version.

## Consequences

### Positives

- **Promesse vitrine tenue** : un visiteur peut réellement déployer en ~5 min.
- **Comparaison cross-cloud factuelle** : les fichiers HCL côte à côte rendent
  visibles les différences de modèle entre clouds (un article potentiel à
  lui seul).
- **Pas de lock-in tooling** : OpenTofu + GH Actions, deux briques
  remplaçables.
- **Auditable** : tout est dans le repo, rien d'opaque.

### Négatives / risques

- **Maintenance × 4** : chaque évolution d'archi doit être répercutée dans
  4 dossiers Terraform. Atténué par les modules partagés (`modules/`) et par
  le scope volontairement minimal (compute + registry + secrets, rien de
  plus).
- **Drift entre clouds** sur les fonctionnalités managées (ex: durées de cold
  start, limites de mémoire). Documenté dans `docs/cost-comparison.md` à
  produire.
- **Coût caché si un visiteur oublie un `tofu destroy`.** Atténué par le
  scale-to-zero des services choisis : sans trafic, coût marginal proche de
  zéro même provisionné.
- **Secrets Terraform en local** = surface d'attaque. Atténué par le chiffrement
  state + scope strict des creds (un seul cloud, droits minimaux).

### Neutres

- L'arbo `terraform/` n'existe pas encore dans le repo. Création en début de
  Phase A (refacto provider) tracée dans `docs/maintainer-todo.md`.
- Un script `deploy/azure-app-registration.sh` existe déjà — il reste utile
  pour l'app reg Entra ID (étape pré-Terraform), pas remplacé par cette ADR.

## Ordre de réalisation

1. **Phase A** (immédiat post-refacto provider) : `terraform/scaleway/` +
   `deploy-scaleway.yml`. Démo publique tourne.
2. **Phase B** : `terraform/azure/` + `deploy-azure.yml`. Article
   "même app, deux clouds".
3. **Phase C** : `terraform/aws/` + `terraform/gcp/` + workflows
   correspondants. Article benchmark cross-cloud.

## Notes

Cette ADR ne décide PAS :

- Le détail des modules `terraform/modules/` (à concevoir au moment où le 2e
  cloud arrive — YAGNI sur l'abstraction tant qu'il n'y a qu'un consommateur).
- Le choix de DB managée par cloud (hors scope V1, voir `docs/backlog/phase-3.md`).
- L'organisation des environnements (dev/staging/prod). V1 = un seul env
  `prod` par cloud, suffisant pour une démo.
