# ADR 0001 — Repositionnement vitrine OSS multi-cloud

## Status

ACCEPTED — 2026-05-09. Remplace l'angle "OSS-first SaaS-track" décrit dans
`docs/launch-strategy.md` (qui reste lisible comme référence historique mais
n'est plus le critère de décision actif).

## Context

Le projet a démarré sous le nom **Easy Analytics for Azure** avec deux pistes
implicites :

1. **Piste produit** — un outil B2B vendable à des équipes Azure App Insights
   mécontentes du portail (cf. `docs/launch-strategy.md` § 1-3, gates de
   traction à T+90 : 500 stars, 100 installs, 5 inbound enterprise, 3 design
   partners pour basculer en SaaS hébergé).
2. **Piste vitrine** — un asset portfolio démontrant une architecture propre,
   citable, auditable.

Après revue, le mainteneur explicite que la **vitrine prime sur la vente**.
L'objectif réel n'est pas de construire un SaaS pour le facturer, c'est :

- faire parler du mainteneur (visibilité technique, opportunités conseil /
  emploi),
- démontrer une architecture cloud-agnostic réellement portable, pas
  spéculative,
- produire du contenu (articles, benchmarks, talks) à partir d'un repo
  fonctionnel,
- offrir un outil utile, gratuit, self-hostable à qui veut.

Sous cet angle, plusieurs hypothèses du `launch-strategy.md` deviennent caduques
ou changent de poids :

| Hypothèse SaaS-track | Statut sous l'angle vitrine |
|---|---|
| Gates de traction à T+90 décident SaaS hébergé vs. pas | **Désactivé.** Pas de bascule SaaS prévue. |
| Coût hébergement à minimiser parce que pas de revenus | **Toujours vrai**, mais pour raison portfolio (un host gratuit/free-tier suffit pour la démo). |
| Niche Azure App Insights | **Élargi.** Le produit doit pouvoir attaquer AWS/GCP/Scaleway-natifs aussi. |
| Phase 3 (multi-tenant SaaS) gated sur traction | **Annulé.** Pas de Phase 3 SaaS. Le repo reste mono-tenant self-host. |
| Phase 4 (multi-cloud) gated sur traction | **Promu en livrable principal.** C'est le cœur de la démonstration. |

## Decision

### 1. Repositionner le projet comme vitrine OSS multi-cloud d'analytics télémétrique

Le pitch devient : *"Plug-and-play analytics dashboard pour télémétrie cloud
(Azure App Insights, AWS CloudWatch, GCP Cloud Logging, Scaleway Cockpit).
2 minutes pour démarrer, MIT, no raw data leaves your tenant, déployable en un
clic sur n'importe lequel des 4 clouds."*

### 2. Renommer le projet

`easy-analytics-for-azure` → **`keren-analytics`**.

- `keren-analytics` signe le mainteneur (domaine perso `keren.run` dédié au
  projet) sans s'enfermer dans un cloud — cohérent avec l'angle vitrine
  multi-cloud.
- Le suffixe `-for-azure` est trompeur dès que les adapters Scaleway/AWS/GCP
  existent.
- Le préfixe `keren-` laisse de la place pour un éventuel `keren-<autre-asset>`
  plus tard si le portfolio s'étend, même si pour l'instant `keren.run` est
  dédié à ce projet (cf. ADR 0002).

Le renommage couvre :
- nom du repo GitHub (`lionelgarnier/easy-analytics-for-azure` →
  `lionelgarnier/keren-analytics`)
- `name` dans `package.json`
- titres dans `README.md`, `public/index.html`, landing page
- références dans tous les docs (`docs/**/*.md`)
- domaine de démo : `analytics.keren.run` (cf. ADR 0002)

Le renommage est **traité dans une PR séparée**, pas dans cette ADR. Il est
suffisamment large pour ne pas être bundlé avec un changement d'architecture.

### 3. Réorganiser la roadmap autour de la démonstration multi-cloud

Nouvel ordre :

| Phase | Livrable | Gate |
|---|---|---|
| Sprint pré-launch (en cours) | Polish actuel, AI surfaces basiques, OSS-ready | Inchangé |
| Phase A | Refacto `src/azure/` → `src/providers/azure/`, formaliser l'interface | Aucun (bénéfice immédiat de clarté) |
| Phase B | Adapter AWS (CloudWatch + X-Ray) + Terraform AWS | Phase A done |
| Phase C | Adapter GCP (Cloud Logging + Trace) + Terraform GCP | Phase B done |
| Phase D | Adapter Scaleway Cockpit (Loki/Prometheus) + Terraform Scaleway | Phase A done (parallélisable) |
| Contenu | Articles : "même app, 4 clouds", benchmark LLM, comparatif coût | Au fil de l'eau |

**Les gates de traction du `launch-strategy.md` ne s'appliquent plus à ces
phases.** Elles sont *le produit*, pas un investissement spéculatif.

### 4. Ce qu'on N'abandonne PAS

- **Stack Node.js / ESM / Express / vanilla JS.** Aucune raison portfolio de
  réécrire en Python/FastAPI. Les 22 templates KQL, l'OAuth PKCE Entra ID, les
  29 tests verts sont des assets — les jeter coûte 100+h pour zéro gain
  démonstration.
- **Pattern ports & adapters déjà partiellement en place** (`mockClient` /
  `realClient`, factory `client.js`). On le formalise (cf. ADR future + patch
  `architecture-multicloud.md`), on ne le réinvente pas.
- **Mock-first development.** Chaque nouvel adapter cloud arrive avec son mock
  client testé.
- **Privacy invariants** (no raw data leaves tenant, KQL-only, OAuth
  délégué). Ils s'appliquent identiquement aux nouveaux providers.

### 5. Critères de succès révisés

À 6 mois post-pivot :

- Le repo tourne en prod sur **au moins 2 clouds** publiquement démontrables.
- `src/core/` n'a aucune dépendance cloud-spécifique (vérifié par lint).
- Au moins **3 articles de blog** publiés à partir du projet (architecture,
  benchmark LLM, retour d'expérience multi-cloud).
- Le repo est cité par **au moins 1 source externe** (newsletter, awesome-list,
  talk, podcast, MS for Startups, etc.).
- Au moins **1 opportunité concrète** (lead conseil, contact recrutement,
  invitation talk) attribuable au repo.

Pas de KPIs SaaS (MRR, MAU, churn). Pas de Stripe à câbler. Pas de page
pricing.

## Consequences

### Positives

- **Cohérence stratégique.** Construire les 4 adapters n'est plus du YAGNI,
  c'est le livrable. La contradiction interne avec `CLAUDE.md` ("Phase 4
  gated, do not start speculatively") disparaît.
- **Charge ops minimale.** Pas de SaaS à opérer = pas de RGPD multi-tenant,
  pas de SLA, pas de support 24/7, pas de DB partagée.
- **Asymétrie favorable.** Effort borné, upside portfolio non borné (un seul
  article qui marche peut générer plus de valeur que 6 mois de prospection
  SaaS).
- **Le pitch HN reste valable** ("plug-and-play analytics, no raw data leaves
  your tenant, MIT") et s'enrichit du multi-cloud.

### Négatives / risques

- **Renoncement au revenu direct.** Pas de monétisation via le repo lui-même.
  Monétisation indirecte uniquement (conseil, emploi, talks). Acceptable vu
  l'absence de budget marketing et le manque de temps pour de la distribution
  active.
- **Scope d'exécution plus large.** 4 adapters cloud à maintenir vs. 1. Atténué
  par le pattern ports & adapters et les mocks.
- **Le `launch-strategy.md` devient partiellement obsolète.** À traiter : soit
  on le réécrit, soit on l'archive avec un en-tête "remplacé par cette ADR".
  Décision : garder en référence, ajouter un en-tête "STATUS: superseded by
  ADR 0001".
- **Renommage du repo casse les liens externes existants.** GitHub redirige
  les anciens noms, mais les forks et bookmarks doivent suivre. Atténué par le
  fait que le projet est encore pré-launch.

### Neutres

- Le `CLAUDE.md` doit être mis à jour pour refléter le nouvel ordre des
  phases. Tâche tracée dans `docs/maintainer-todo.md`.
- Les gates SaaS (`launch-strategy.md` § 3) restent lisibles si jamais le
  mainteneur veut basculer plus tard. Pas de suppression d'option.

## Notes

Cette ADR ne décide PAS :

- Le choix d'hôte de la démo publique (cf. ADR 0002).
- L'organisation Terraform par cloud (cf. ADR 0003).
- L'évolution exacte de la couche AI / LiteLLM (cf. patch
  `architecture-multicloud.md` et `architecture-ai.md`).
