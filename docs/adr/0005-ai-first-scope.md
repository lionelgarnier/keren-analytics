# ADR 0005 — AI-first setup wizard comme pre-launch scope (SQLite + Azure AI Foundry)

## Status

ACCEPTED — 2026-05-11. **Étend** ADR 0001 (portfolio pivot) et ADR 0004
(Azure-first hosting). **Re-priorise** Phase 3 partiellement (persistance) :
SQLite single-instance ramené pre-launch, multi-tenant Postgres reste post-traction.

## Context

Après la complétion de Phase A (infra Azure provisionnée, OAuth real prod
validé, CI/CD OIDC en place — cf. ADR 0004), le mainteneur a remis en question
la viabilité du launch tel que prévu par `launch-strategy.md` :

> *"Avant le launch, ne faut-il pas mieux implémenter d'autres fonctionnalités?
> genre IA? car sauf erreur de ma part on a pas encore de LLM implémenté...*
> *Sans ça l'outil n'a que peu de valeur! Genre un vrai audit où l'on voit ce
> que l'IA découvre, ses mappings, et demande validation à l'utilisateur."*

Cette intuition rejoint un risque que la stratégie launch-readiness avait
sous-estimé : **AI-washing**. Le pitch actuel insiste sur "AI-mapped schema"
et "AI explains your telemetry", alors que le code n'a aucun appel LLM :

| Claim côté pitch | Réalité technique |
|---|---|
| "AI-mapped schema" | Alias table + regex hardcodés (`core/mapping.js`) |
| "AI explains your telemetry" | Generator déterministe templated (`core/narration.js`, badge *"Preview — real LLM coming soon"*) |
| "AI prompts ready to copy" | Strings templates dans `core/promptGenerator.js` |

Sur Show HN, un commentateur curieux qui ouvre le code identifie en 30 secondes
qu'il n'y a pas de LLM, et le top-comment de mauvaise foi devient le souvenir
du launch.

Plus important : la vision produit du mainteneur n'est pas "narration AI sympa
en pied de page" mais **"l'outil scanne le tenant, dresse un audit, propose un
mapping et des recommandations, demande validation à l'utilisateur"** — c'est
le moment "wow" du first-run. Sans ça, le produit est un Azure dashboard de
plus.

## Decision

### 1. Scope pre-launch étendu — AI-first setup wizard devient un blocker

Le sprint pre-launch (cf. `docs/backlog/launch-readiness.md`) s'enrichit d'une
**Track F (AI-first scope, ~15 jours focus)** qui doit shipper **avant** le
hard launch (Show HN / Reddit / dev.to). Track F couvre :

1. Persistance SQLite (remplace `metadataStore` fs-backed).
2. Schema scan enrichi (volume par event type, distribution custom dimensions,
   samples PII-free, gaps détectés).
3. AI mapping + recommendations service (Azure AI Foundry, gpt-4o-mini par
   défaut, fallback déterministe).
4. Setup wizard UI (multi-step *Scanning → AI findings → Validate/edit → Save*).

Les autres tracks AI (`ai-natural-language-queries`,
`ai-instrumentation-assistant`) restent post-launch. Seul le setup wizard est
pre-launch.

### 2. Persistance — SQLite, pas Postgres ni Cosmos DB

**Choix : SQLite (`better-sqlite3` ou `node:sqlite` natif Node 22.5+).**

Justifications :

- **Single-replica Container App** est déjà notre realité (CLAUDE.md
  l'enforce de facto). SQLite single-file s'aligne sans overhead.
- **Zéro service Azure additionnel** — pas de DB managée à provisionner,
  pas de coût mensuel (Azure SQL Basic = 4-12 €/mo, Cosmos DB serverless
  ~25 €/mo).
- **Backup simple** — `cp keren.db backup-$(date).db` puis upload Azure Blob
  via cron Container App ou GitHub Action.
- **Transactions, indexes, full SQL** — couvre tous nos besoins schémas
  (tenants, scans, mappings, signals, validations).
- **Migration future vers Azure SQL** triviale si V2 multi-tenant arrive
  (schéma transposable, code couche query identique avec Knex/Drizzle).

Le fichier `keren.db` vit dans `data/` (déjà créé par le Dockerfile,
volume mountable plus tard si besoin de persistence cross-restart).

**Risque accepté** : si le Container App redémarre et n'a pas de volume
persistent, on perd les scans. Mitigation :
- Backup horaire via cron Azure Container Apps Jobs vers Azure Blob.
- Au démarrage : si pas de `keren.db` local mais backup récent dans Blob,
  pull le backup (option `RESTORE_FROM_BLOB=1`).
- Acceptable car le scan est re-runnable (juste un re-coût LLM).

### 3. Inference — Azure AI Foundry, pas Azure OpenAI direct

**Choix : Azure AI Foundry (Hub + Project + connection Azure OpenAI).**

Tradeoff (vs Azure OpenAI direct) :

- **Optionalité de model** — Foundry expose Mistral Small Latest, Llama,
  Cohere en plus de la gamme OpenAI. Mistral Small est ~50% moins cher que
  gpt-4o-mini, intéressant pour la phase narration une fois validée la
  qualité.
- **Routing par deployment name** — un seul endpoint, on swap de modèle sans
  re-provisioning.
- **Coût identique** sur OpenAI route — Foundry route vers Azure OpenAI sous
  le capot, pas de markup.
- **Bicep plus volumineux** (~100 lignes en plus : Hub + Project + storage +
  Key Vault + connection vs juste `Microsoft.CognitiveServices/accounts`).
  Coût acceptable pour l'optionalité.

**V1 model** : `gpt-4o-mini` (`gpt-4o-mini-2024-07-18`).
- Coût : ~0.15 $/M input + 0.60 $/M output.
- Fiable pour sortie JSON structurée (Mistral parfois capricieux).
- Quota par défaut Founders Hub : 30k TPM (assez pour le pre-launch demo).

**Auth** : Managed Identity Container App → role `Cognitive Services User` sur
le Foundry Hub. Pas de clé API dans les env vars. Endpoint en env var.

**Quota guard** : daily cap à 10 €/jour côté code (cf.
`docs/backlog/launch-readiness.md` E1 — cap LLM déjà planifié). Au-delà,
fallback automatique vers le generator déterministe + un toast UI "AI quota
reached for today, deterministic fallback active". Pas de 500.

### 4. Conséquences sur le récit AI

Les claims du pitch deviennent **littéralement vrais en real mode** :

- "AI-mapped schema" = Layer 2 LLM avec confidence scores (Layer 1 alias
  reste le fallback).
- "AI explains your telemetry" = vraie inference Azure OpenAI à chaque first
  load, avec cache persisté dans SQLite (re-utilisée jusqu'au prochain scan).
- "AI prompts ready to copy" = générés par le scan, contextualisés à la
  télémétrie réelle.

Le badge *"Preview — real LLM coming soon"* sur le narration panel est retiré.

### 5. Founders Hub et coûts inférence

- **1 000 € de crédits Azure Founders Hub déjà approuvés** (statut 2026-05-11).
- **5 000 € supplémentaires en cours de validation** (montant total possible :
  150 000 $ sur 4 ans selon le niveau Founders Hub atteint).
- Couvre largement l'inference pre-launch + ~3 mois post-launch même en cas
  de spike HN (avec quota guard à 10 €/jour).
- Si pay-as-you-go ponctuel avant validation 5k€ : coût négligeable
  (gpt-4o-mini ~3-5 € pour le développement complet de Track F).

## Consequences

### Positives

- **Pitch HN authentique** — plus de risque AI-washing. *"The demo's setup
  wizard actually uses Azure OpenAI on your live telemetry, no raw data
  leaves your tenant."*
- **Différenciation produit forte** — l'audit-first onboarding est unique sur
  ce segment ; ni Datadog ni Power BI ni le portail Azure ne le font.
- **Moment "wow" récupéré** — le first-run scan + AI proposal est le pivot
  emotional du produit.
- **Architecture-ai.md amorcé** — le provider abstraction reste valide,
  Azure AI Foundry comme première implémentation de `azureFoundryProvider`.
- **SQLite enable future features** — historique des scans, comparaisons
  time-series sur les schémas, rétention des prompts validés.

### Négatives / risques

- **Délai launch ~3 semaines de plus** — passe d'environ "Show HN dans 2
  semaines" à "Show HN dans 5-6 semaines" (15 jours Track F + 1-2 semaines
  contenus + buffer). Acceptable selon le mainteneur (2026-05-11 : "Pas de
  soucis de timing").
- **Surface de tests élargie** — il faut un mock provider AI fiable pour que
  `npm test` reste rapide et déterministe (couvert par
  `architecture-ai.md` § AI provider abstraction, à étendre).
- **Coût Bicep** — `infra/main.bicep` passe de ~200 à ~300 lignes (Foundry
  Hub + Project + connections). Validation et redeploy time augmentent
  proportionnellement.
- **Risque scope creep** — l'AI setup wizard est tentant à enrichir sans fin
  (Layer 3 user override edit UI, A/B test scans, etc.). Discipline : Track F
  ship minimal, le reste post-launch.

### Neutres

- `narration.js` reste comme fallback déterministe (Layer 1 de la nouvelle
  archi).
- Les autres AI specs (`ai-natural-language-queries`,
  `ai-instrumentation-assistant`) restent post-launch — pas re-priorisées.
- ADR 0004 inchangée : Azure Container Apps France Central reste l'host.

## Plan d'exécution — Track F (~15 jours focus)

| Chantier | Effort | Sortie | Dépendances |
|---|---|---|---|
| F1. Persistance SQLite | 2-3 j | `better-sqlite3` installé, schéma `tenants/scans/mappings/signals/validations`, `core/metadataStore.js` réécrit, migration `data/store.json` (legacy). | — |
| F2. Schema scan enrichi | 2-3 j | `core/schemaScan.js` étend `schemaProfile.js` : volumes, top-N customDimensions par event, schéma timestamps, gaps détectés. Persistance via F1. | F1 |
| F3. AI mapping + recommendations | 3-4 j | `src/ai/azureFoundry.js` provider, prompt structuré JSON schema, fallback déterministe sur quota/error, quota guard 10€/j. Wire dans le scan. | F1, F2, Azure AI Foundry provisionné |
| F4. Setup wizard UI | 4-5 j | Nouveau flow `/setup` : 4 étapes (`Scanning → AI findings → Validate/edit → Save`). Re-scan button dans settings. Persist chaque étape. | F1, F2, F3 |
| F5. Documentation + tests | 1-2 j | Specs `ai-setup-wizard.md` + `ai-environment-analysis.md` mises à jour. Tests unitaires AI provider (mock). Tests end-to-end wizard flow. | F1-F4 |

Pre-requisite maintainer-side (avant F3) : provisionner Azure AI Foundry
workspace + model deployment gpt-4o-mini (cf. `docs/maintainer-todo.md` § AI
Foundry).

## Notes — what this ADR does NOT decide

- **Mistral Small vs gpt-4o-mini** pour la narration — V1 stays gpt-4o-mini,
  Mistral à évaluer post-launch via Foundry routing (zero re-provisioning).
- **Backup SQLite policy détaillé** — fréquence, retention, restore flow.
  À spécifier dans la PR F1.
- **Volume Container Apps pour persistance** — Container Apps a une feature
  Storage Mount (Azure Files). À évaluer dans F1 vs juste backup régulier.
- **Phase 3 multi-tenant Postgres** — toujours post-traction, gate
  inchangée. SQLite suffit pour le launch.
- **`AI_PROVIDER=none` mode** — doit continuer à fonctionner (mock LLM)
  pour les tests CI et les self-hosters sans budget LLM. Garde-fou
  `architecture-ai.md`.

## Lessons learned (pour la trace)

L'erreur évitée ici : valider la stratégie launch (`launch-strategy.md`,
écrit après ADR 0001 + 0004) sans la re-confronter à la vision produit du
mainteneur. La stratégie disait "ship deterministic, real LLM post-launch"
parce qu'elle optimisait sur la *vélocité*. Le mainteneur a re-priorisé sur
l'*authenticité du pitch* et la *valeur produit ressentie*. Les deux sont
légitimes — le bon move est de laisser le mainteneur trancher quand l'enjeu
est stratégique (pas tactique).

Trace de cet arbitrage maintenu publiquement = même bénéfice que pour ADRs
0001-0004 : un journal d'archi qui montre l'auteur sur-corriger et se
reprendre est plus crédible qu'un repo où tout semble linéaire.
