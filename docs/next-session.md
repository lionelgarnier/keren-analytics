# Next-session pickup — Track F (AI-first setup wizard)

> **Quand tu démarres une nouvelle session ou une nouvelle branche pour
> attaquer Track F, colle ce fichier dans le premier message à Claude.**

## Contexte one-liner

Phase A (infra Azure + CI/CD + custom domain) est terminée et en prod sur
`https://analytics.keren.run`. La prochaine étape est **Track F (AI-first
setup wizard, ~15 jours focus)** — ré-scopée pre-launch par
[ADR 0005](adr/0005-ai-first-scope.md) parce que le pitch "AI-mapped /
AI explains" était de l'AI-washing (aucun LLM wiré dans le code).

## Reading order (pour reprendre le contexte)

1. **[`docs/adr/0005-ai-first-scope.md`](adr/0005-ai-first-scope.md)** — la
   décision stratégique (pourquoi, quoi, comment, conséquences).
2. **[`docs/backlog/launch-readiness.md`](backlog/launch-readiness.md) §
   Track F** — le plan d'exécution concret (chantiers F1-F5 avec effort
   estimates et dépendances).
3. **[`docs/backlog/ai-setup-wizard.md`](backlog/ai-setup-wizard.md)** +
   **[`docs/backlog/ai-environment-analysis.md`](backlog/ai-environment-analysis.md)** —
   design intent (target experience, 3-layer mapping, prompts).
4. **[`docs/architecture-ai.md`](architecture-ai.md)** — provider
   abstraction (`AI_PROVIDER=none|ollama|azure-foundry`).
5. **[`CLAUDE.md`](../CLAUDE.md)** — invariants codebase, conventions, ce
   qu'il ne faut pas casser.

## Decisions actées (ne pas re-discuter)

- **Persistance** : SQLite (`data/keren.db`), pas Postgres. Multi-tenant
  Postgres reste post-traction.
- **Inference** : Azure AI Foundry (Hub + Project + `gpt-4o-mini`
  deployment). Mistral Small reste optionnel post-launch via Foundry routing.
- **Auth Foundry** : Managed Identity (déjà existante côté infra), role
  `Cognitive Services User`. Pas de clé API en env var.
- **Quota guard** : 10 €/jour hard cap, fallback déterministe au-delà.
- **`AI_PROVIDER=none` mode** : doit continuer à marcher (mock, tests CI,
  self-hosters sans budget LLM).
- **Region** : France Central pour le compute. Foundry idem si disponible,
  sinon West Europe acceptable.
- **Launch delay** : ~3 semaines de plus que prévu acceptés (mainteneur a
  validé 2026-05-11).

## Founders Hub credits status (2026-05-11)

- **1 000 € Azure approuvés** — utilisables immédiatement.
- **5 000 € supplémentaires en cours de validation** (Microsoft for
  Startups Founders Hub).
- Ne pas redemander à chaque session. Si le statut change, l'agent met à
  jour [`maintainer-todo.md`](maintainer-todo.md) § Founders Hub.

## Ordre d'exécution suggéré

1. **F1 — Persistance SQLite** (2-3 jours). Aucune dépendance bloquante.
   Démarrer ici. Une fois shipped, F2 et F3 peuvent partir en parallèle si
   bandwidth.
2. **F2 — Schema scan enrichi** (2-3 jours). Dépend de F1.
3. **F3 — AI mapping service** (3-4 jours). Dépend de F1 + F2 + Azure AI
   Foundry provisionné (action maintainer — cf.
   [`maintainer-todo.md`](maintainer-todo.md) § "Provisionner Azure AI
   Foundry"). Si Foundry pas encore là, F3 peut être préparée en local
   avec `AI_PROVIDER=none` (mock).
4. **F4 — Setup wizard UI** (4-5 jours). Dépend de F1-F3.
5. **F5 — Docs + tests** (1-2 jours). En parallèle de F4.

## Garde-fous quand tu codes Track F

- **Ne pas casser le mode `AZURE_MODE=mock`** — toute la suite de tests
  tourne en mock. Le scan en mock doit retourner des données canned
  réalistes (utiliser et étendre `src/azure/mockData.js`).
- **Ne pas casser l'OAuth** — `keren-analytics` app reg dans Entra ID est
  la seule app touchant l'auth user. Ne pas y toucher (la CI utilise
  `keren-analytics-ci` séparée).
- **CI/CD garde-fou** : le workflow `.github/workflows/deploy-azure.yml`
  triggers sur changes dans `src/**`. Toute modif côté `src/` triggere un
  redeploy auto. Si tu ajoutes des env vars Container App (par exemple
  `AZURE_FOUNDRY_ENDPOINT`), il faut les setter via
  `az containerapp update --set-env-vars ...` une fois (le workflow
  préserve l'existant).
- **Bicep update pour Foundry** : se fait dans `infra/main.bicep`. Le
  workflow CI ne redeploye PAS le Bicep (image-only path). Donc les
  changes Foundry passent par `./deploy/azure-deploy.sh` lancé une fois
  manuellement, ou via `az deployment group create` direct.
- **Tests** : `npm test` doit rester < 1s end-to-end. Si tu wires un
  client AI réel, il faut un mock derrière une factory pour les tests.
- **No raw data persisted** : la promesse "no raw data leaves your
  tenant" tient toujours. Le scan capture *des samples scrubbed* + *des
  métadonnées*, pas des rows entières. Coverage par
  `scripts/security-audit.mjs` (déjà encodé).

## Liens utiles pour la nouvelle session

- Repo : <https://github.com/lionelgarnier/keren-analytics>
- Démo prod : <https://analytics.keren.run>
- Azure Portal RG : `keren-analytics-prod` (France Central)
- Subscription : `0a3afaae-8849-4b27-8e43-dad3ba80ce58`
- Container App : `ca-keren-analytics`
- ACR : `kerenanalyticsdfrvtmlbgqqbk.azurecr.io`
- App reg OAuth utilisateur : `keren-analytics` (appId `fba047ba-...`)
- App reg CI : `keren-analytics-ci` (appId `05620278-...`)

## Une fois Track F shipped

Track F finie → on revient au plan launch-readiness.md tracks A/D/E
(Hero GIF, OG image, drafts Show HN / Reddit / dev.to, Plausible/Umami
snippet, Cloudflare devant la démo). Compter ~1-2 semaines.

Puis : rendre le repo public, activer la branch protection, lancer le
Show HN un mardi US morning. Cf. [`launch-strategy.md`](launch-strategy.md)
§ 5 pour le playbook day-J.
