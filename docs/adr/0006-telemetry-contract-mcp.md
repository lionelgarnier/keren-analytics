# ADR 0006 — Telemetry contract public + roadmap MCP (instrumentation-first)

## Status

ACCEPTED — 2026-06-07. **Étend** ADR 0005 (AI-first scope) et la spec
`docs/backlog/ai-instrumentation-assistant.md`. **Ne re-priorise rien** : la
Phase 0 (contrat statique) ship dans cette PR ; les phases MCP suivantes
restent post-launch, gate inchangée.

## Context

Le mainteneur veut, à terme, *« un MCP ou équivalent afin que les outils de
code (Cursor, Claude, …) aient des billes pour coder au mieux leur télémétrie,
avec best practices et config/valeurs pour que ce soit bien pris en compte sur
Keren Analytics »*.

Aujourd'hui Keren fonctionne en **diagnostic a posteriori** : il scanne la
télémétrie *existante* d'un tenant, détecte les trous
(`core/schemaScan.js` → `gaps`), score la complétude
(`core/readinessScore.js`, 7 signaux pondérés / 120 pts max) et génère un
`code_prompt` que l'utilisateur colle dans son outil de code
(`core/promptGenerator.js`). Le sens est : *« voici ce qui manque »*, après
coup.

Ce que le mainteneur décrit est l'**inversion** de ce flux : donner aux agents
de code, *en amont* (pendant qu'ils instrumentent), le « contrat » que Keren
attend — quels signaux émettre, comment nommer les custom dimensions, quelles
valeurs de config — pour qu'une appli soit verte dès le premier scan, sans
passer par le mapping manuel du wizard.

C'est, à la livraison près, la surface **AI Instrumentation Assistant** déjà
spécifiée et différée (`docs/backlog/ai-instrumentation-assistant.md`). L'angle
« MCP » n'est qu'un **canal de livraison** de cette même connaissance.

Observation structurante : **le contrat existe déjà**, éparpillé dans le code.

| Brique du contrat | Source de vérité (déjà en prod) |
|---|---|
| Signaux + poids + catégories + barème | `core/readinessScore.js` (`SIGNAL_WEIGHTS`, `GRADE_THRESHOLDS`) |
| Conventions de nommage (alias custom dims) | `core/mapping.js` (`ALIASES`, `mappingExpressions`) |
| Recettes par stack + prompts copiables | `core/promptGenerator.js` (`STACK_HINTS`, `PROMPT_TEMPLATES`) |
| Best practices de config | dogfooding `src/telemetry.js` (flush, exclusion `/healthz`, no-PII, cloudRole) |

Le risque n°1 d'un MCP construit naïvement serait de **recopier** « ce que
Keren veut » à un deuxième endroit, qui dérive ensuite du comportement runtime.

## Decision

### 1. Le contrat est *dérivé*, jamais recopié

Un nouveau module pur `src/core/telemetryContract.js` (`buildTelemetryContract()`)
**dérive** l'intégralité du contrat des modules source ci-dessus. Aucune
valeur (« ce que Keren veut ») n'y est ré-énoncée à la main. Les seules
connaissances propres au module sont les spécificités *Application Insights*
qui ne vivent dans aucun scorer (table/champ cible par signal, KQL de
vérification, conseils de config) — pas le barème ni les alias.

Conséquence enforced par `tests/telemetryContract.test.js` : si les poids, le
barème ou la table d'alias changent, le contrat publié change *automatiquement*
et le test de non-dérive échoue tant que le snapshot committé n'est pas
régénéré (`npm run build:contract`).

### 2. Phase 0 (cette PR) — contrat statique, zéro install

Le plus gros ROI pour le plus petit effort : exposer le contrat à des URLs
stables que n'importe quel agent peut fetch, **sans rien installer**.

- `GET /.well-known/telemetry-contract.json` — machine-readable, versionné
  (`contractVersion` = hash de contenu, stable hors `generatedAt`).
- `GET /llms.txt` — companion Markdown lisible humain/LLM.

Servies dynamiquement depuis le module (toujours fraîches), enregistrées avant
`express.static` et les rate limiters (endpoints publics, cacheables, sans
donnée tenant, `Cache-Control: max-age=3600`). Snapshots committés sous
`public/` via `npm run build:contract` pour l'hébergement statique et le docs
bundle ; le test de non-dérive garantit qu'ils ne pourrissent pas.

### 3. Phases suivantes (post-launch, non engagées ici)

- **Phase 1 — MCP en lecture seule.** Serveur MCP distant (Keren héberge déjà
  sur keren.run) exposant le même contrat via des outils : `get_contract`,
  `get_recipe(stack)`, `get_naming_conventions`. Dérivé du **même module** que
  la Phase 0 — pas de logique dupliquée.
- **Phase 2 — validation interactive.** Outil `score_telemetry_plan(events,
  dimensions)` qui réutilise `computeReadinessScore` pour prédire le score
  *avant* déploiement (« avec ce que tu prévois, tu seras à 75/120, il te
  manque browserTimings »).
- **Phase 3 — boucle fermée.** `verify_resource(resourceId)` contre la vraie
  ressource App Insights : l'agent confirme que l'instrumentation est bien
  ingérée. C'est la « loop closure » décrite dans
  `ai-instrumentation-assistant.md`.

### 4. Pourquoi MCP *et* spec statique, pas l'un ou l'autre

- Le **spec statique** gagne sur la découvrabilité zéro-friction (un `fetch`,
  pas d'install MCP) et sert tout agent, même hors écosystème MCP.
- Le **MCP** gagne sur l'*interactif* : l'agent peut appeler « score ce plan »
  ou « donne la recette React » pendant qu'il code, et à terme vérifier la
  boucle.

Les deux partagent une seule source de vérité (le module §1), donc les ajouter
n'ajoute pas de surface de dérive.

## Consequences

### Positives

- **Onboarding inversé** — un dev peut instrumenter correctement *avant* de
  brancher Keren ; le premier scan est vert, le wizard de mapping est sauté.
- **Cohérence garantie** — barème, alias et prompts affichés aux agents ne
  peuvent pas diverger du runtime (test de non-dérive).
- **Découvrabilité standard** — `/.well-known/…` + `/llms.txt` sont des
  conventions que les agents savent déjà chercher.
- **Réutilise l'existant** — `SIGNAL_WEIGHTS`, `ALIASES`, `PROMPT_TEMPLATES`
  sont simplement *exposés*, pas réécrits.
- **Respecte l'invariant privacy** — le contrat ne renvoie que des
  métadonnées et des scores, jamais de log brut ni de PII.

### Négatives / risques

- **Surface publique nouvelle** — deux routes non authentifiées de plus. Coût
  réel faible (réponse petite, cacheable, sans donnée tenant).
- **`maxScore` = 120, pas 100** — historiquement le score inclut
  `browserTimings` (15) en plus des « 7 signaux » du pitch. Le contrat
  affiche le vrai `maxScore` du scorer pour rester honnête ; à surveiller si
  le messaging marketing dit « /100 ».
- **Snapshot à régénérer** — un changement de barème/alias oblige à lancer
  `npm run build:contract` (sinon CI rouge). Friction acceptable, c'est le
  prix de l'anti-dérive.

### Neutres

- Phases 1-3 (MCP) ne sont **pas** engagées par cet ADR — elles restent dans
  `ai-instrumentation-assistant.md`, post-launch.
- `promptGenerator.js` continue de servir le `code_prompt` in-app inchangé ;
  le contrat réutilise les mêmes templates pour ses `recipes`.

## Notes — ce que cet ADR ne décide PAS

- **Choix du SDK/serveur MCP** (stdio vs HTTP, framework) — à trancher en
  Phase 1.
- **Auth de `verify_resource`** (Phase 3) — réutilisera vraisemblablement le
  flux OAuth/token existant ; à spécifier le moment venu.
- **Versioning du contrat** au-delà du hash de contenu (changelog, dépréciation
  de champs) — à formaliser si des consommateurs externes s'y arriment.
