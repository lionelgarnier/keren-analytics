# ADR 0002 — Hôte de la démo publique : Scaleway

## Status

ACCEPTED — 2026-05-09. Dépend de l'ADR 0001 (vitrine OSS multi-cloud).

## Context

Sous l'angle vitrine validé en ADR 0001, le projet a besoin d'**une URL
publique** où n'importe qui peut tester l'app sans installer Docker.
Caractéristiques requises de l'hôte :

- **Scale-to-zero** ou free tier généreux — la démo n'aura pas de trafic
  régulier, payer h24 pour un container endormi est absurde.
- **Déploiement par push d'une image OCI standard** — pas de runtime
  propriétaire, pas de vendor-lock sur le format.
- **Cohérent avec le pitch.** L'app vend la souveraineté des données
  (`no raw data leaves your tenant`). L'héberger sur un cloud non-EU contredit
  partiellement le message côté opérateur — pas un blocker, mais un signal.
- **Coût borné** — cap implicite < 20 €/mois (cf. `launch-strategy.md` § 2).
- **Documentable.** L'hôte fait partie du contenu portfolio
  (article "pourquoi j'ai choisi X").

Quatre candidats sérieux ont été comparés :

| Hôte | Scale-to-zero | Free tier | Souveraineté EU | Format | Verdict |
|---|---|---|---|---|---|
| **Scaleway Serverless Containers** (`fr-par`) | Oui | Oui (60M req + 200kvCPU·h/mois) | Oui (FR, PEC géré) | OCI standard | Retenu |
| Render | Non (free spin-down ≠ scale-to-zero strict, mais OK démo) | Oui | Non (US) | Docker | Backup possible |
| Azure Container Apps | Oui | Limité | Partiel (UE-region OK, opérateur US) | OCI | Incohérent avec l'angle souveraineté |
| Fly.io | Oui | Oui | Variable | OCI | OK technique, narrative US |

## Decision

### 1. Hôte primaire de la démo : Scaleway Serverless Containers, région `fr-par`

Justifications :

1. **Cohérence narrative.** Souveraineté EU côté opérateur + souveraineté EU
   côté données utilisateur (Azure West Europe, AWS `eu-west-3`, GCP
   `europe-west`, Scaleway `fr-par`) = pitch homogène pour les buyers
   régulés / publics / banques EU.
2. **Scale-to-zero natif.** L'instance s'éteint sans trafic, coût nul. Premier
   visiteur a un cold start de ~2-5s, acceptable pour une démo.
3. **Free tier large.** Couvre largement le trafic d'un Show HN (8-30k
   visiteurs / jour pendant 24h, puis longue traîne).
4. **Format OCI standard.** L'image Docker construite est identique à celle
   déployée sur AWS/GCP/Azure dans les phases B-D de l'ADR 0001. Pas de
   re-build par cloud.
5. **Asset éditorial.** "Pourquoi j'ai déployé mon SaaS B2B chez Scaleway en
   2026" est un article naturel (souveraineté, RGPD, EU AI Act, comparatif
   coût).

### 2. Stack reste Node.js

L'addendum initial proposait une réécriture en Python/FastAPI. **Rejeté.**
Aucun service Scaleway ne l'exige. L'image Docker actuelle (Node 22 Alpine,
non-root, multi-stage) est portable telle quelle.

### 3. Pas de migration de données

L'app est mono-tenant self-host avec metadata in-memory (`metadataStore.js`,
documenté comme gap Phase 3 dans `CLAUDE.md`). Pas de DB à migrer. La démo
publique tourne en mock mode (`AZURE_MODE=mock`) ou en mode "bring your own
Azure" via OAuth — l'opérateur Scaleway n'héberge aucune donnée client.

### 4. Auth opérateur

Pour faire tourner la démo publique avec un vrai backend Azure, le mainteneur
a besoin d'une **app registration Entra ID multi-tenant**. Cela ne nécessite
**aucune souscription Azure payante** :

- Un compte Microsoft personnel gratuit donne accès à un tenant Entra ID.
- Alternativement, le programme Microsoft 365 Developer (gratuit) provisionne
  un tenant complet.
- L'app registration produit `AZURE_CLIENT_ID` et `AZURE_CLIENT_SECRET`.
- Les utilisateurs finaux (qui ont, eux, un Azure payant avec App Insights) se
  connectent via OAuth délégué et apportent leurs propres permissions.

Conséquence : la démo Scaleway peut fonctionner avec un backend Azure réel
**sans que le mainteneur ne paie un centime à Microsoft**. Documenté en détail
dans `docs/setup-entra-id.md`. Le même principe s'appliquera aux adapters AWS
(IAM Identity Center / Cognito), GCP (OAuth Google) et Scaleway (IAM tokens).

### 5. Variables d'environnement & secrets

- Stockage des secrets : **Scaleway Secret Manager** (pas en clair dans la
  config Serverless Container).
- CI/CD : GitHub Actions, secrets injectés au déploiement, jamais commits.
- Variables documentées dans `.env.example` (à enrichir au fil des adapters).

### 6. Région et failover

- Région primaire : `fr-par` (Paris).
- Pas de failover multi-région en V1 (démo, pas SLA). Atténué par le
  scale-to-zero — un downtime régional fait perdre des visites, pas de
  données.

### 7. Domaine

- Domaine racine : **`keren.run`** (déjà détenu par le mainteneur, dédié à
  ce projet — cf. ADR 0001).
- URL canonique de la démo : **`https://analytics.keren.run`**.
- Racine `https://keren.run` : redirige vers `analytics.keren.run` en V1
  (page d'accueil dédiée optionnelle plus tard si le portfolio s'élargit).
- Certificat TLS via Let's Encrypt géré par Scaleway.
- DNS chez le registrar actuel de `keren.run` ; enregistrement `CNAME`
  `analytics` → endpoint Scaleway Serverless Container.

## Consequences

### Positives

- **Coût quasi nul** sous trafic démo (free tier couvre largement).
- **Cohérence narrative souveraineté** end-to-end.
- **Image Docker identique** à celle déployée sur les autres clouds en
  Phase B-D — réutilisation immédiate.
- **Asset éditorial** : un article portfolio naturel.

### Négatives / risques

- **Cold start ~2-5s** sur premier hit après inactivité. Acceptable pour une
  démo, à surveiller si trafic régulier émerge.
- **Free tier Scaleway peut évoluer.** Pas de garantie long terme. Atténué par
  la portabilité OCI : si le free tier disparaît, on bascule sur Fly.io ou
  Render en quelques heures (Dockerfile inchangé).
- **Programme Scaleway Startup non garanti.** Le pitch initial ciblait
  Early Stage (€9k credits) ou Growth (€36k). Si refusé, le free tier suffit
  pour la démo seule. Crédits utiles surtout si on veut héberger du LLM lourd
  côté Scaleway Generative APIs au-delà du free tier.

### Neutres

- L'opérateur doit créer un compte Scaleway et un compte Microsoft
  (Entra ID gratuit). Tracé dans `docs/maintainer-todo.md`.
- Render reste documenté comme alternative (cf. blueprint Render existant
  mentionné dans `CLAUDE.md`), pour les self-hosters qui veulent un déploiement
  US ou plus permissif.

## Notes

Cette ADR n'engage PAS :

- Le choix de provider LLM par défaut (cf. `architecture-ai.md`). Scaleway
  Generative APIs est une option intéressante mais le défaut reste `none` ou
  `ollama` selon l'ADR AI.
- L'organisation Terraform (cf. ADR 0003).
- Le choix d'hôte par les self-hosters utilisateurs du projet — ils déploient
  où ils veulent, c'est tout l'intérêt du repo OSS.
