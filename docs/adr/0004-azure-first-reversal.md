# ADR 0004 — Retournement Azure-first : ship d'abord, multi-cloud comme V2 conditionnel

## Status

ACCEPTED — 2026-05-09. **Supersede partiellement** :

> **Amendment 2026-05-10** — Phase A initial deploy effectué. Deux points de
> détail laissés ouverts par l'ADR sont résolus :
> - **Région retenue** : *France Central*, pas *West Europe*. Préférence
>   souveraineté FR du mainteneur ; latence depuis Paris ~5ms vs ~15ms ;
>   coût quasi-identique. La logique "souveraineté EU light" de la § 2 reste
>   valable, juste avec un endpoint physiquement en France.
> - **Bicep vs Terraform** : tranché pour **Bicep**. Plus court (~280 lignes
>   pour le stack complet), idiomatique Azure, parsing natif des secrets
>   `@secure()`. Terraform reste pertinent si la V2 multi-cloud arrive — pas
>   de coût à reprendre à ce moment-là.
>
> Voir `infra/main.bicep` et `deploy/azure-deploy.sh`.

- ADR 0001 § Decision 3 (réorganisation roadmap multi-cloud comme livrable principal) → remplacé.
- ADR 0002 (Scaleway comme hôte de la démo) → remplacé.
- ADR 0003 (Terraform per-cloud one-click multi-cloud) → reporté / réduit en scope.

Les ADR 0001/0002/0003 restent dans le repo comme **trace honnête de la
décision** (un journal d'archi public où on voit les retournements est un
asset crédibilité, pas un défaut). Des bannières "STATUS UPDATE" en tête de
ces ADRs pointent vers cette ADR 0004.

## Context

Après prise de recul demandée par le mainteneur, plusieurs constats reviennent
sur la table :

1. **La douleur initiale est réelle et personnelle.** Le mainteneur a vécu la
   friction du portail Application Insights. Le produit n'est pas un prétexte
   pour faire de l'archi — c'est une vraie réponse à un vrai problème
   ressenti.

2. **Le positionnement personnel visé est "product engineer / shipper".** Pas
   "architecte cloud". Cela change radicalement ce qui sert la marque : un
   outil concret utilisé > une démo abstraite de pattern. Les recruteurs et
   clients conseil regardent "qu'est-ce que tu as shippé qui a compté", pas
   "quels patterns tu as implémentés".

3. **Le canal de distribution gratuit est Azure-spécifique.** Awesome-Azure,
   Microsoft MVPs, MS DevRel, MS for Startups — tout cet écosystème pousse
   l'OSS Azure-friendly *gratuitement*. Cet asset disparaît dès que le projet
   devient "multi-cloud générique" : Microsoft n'a aucune raison de promouvoir
   un outil qui sert aussi AWS et GCP. C'était le levier asymétrique le plus
   important du `launch-strategy.md`, on ne peut pas le sacrifier sans raison.

4. **L'archi multi-cloud-from-day-one est un piège classique pour solo-dev.**
   4 adapters × N templates × N mocks × N docs alors qu'aucun n'a été validé
   par un utilisateur réel. Sape simultanément la vélocité produit (rien
   n'est prêt à temps) et le récit marque (donne l'impression de ne pas
   savoir choisir).

5. **Microsoft for Startups Founders Hub change l'équation hébergement.**
   Crédits Azure 5k-150k$ sur 4 ans, accessibles à un solo-dev avec un
   projet B2B identifiable, sans tour de table. Le coût d'hébergement Azure
   pour la démo devient nul, le badge "Microsoft for Startups" ajoute un
   signal de crédibilité gratuit auprès de buyers Azure, et l'option
   acquihire/visibilité MS DevRel reste ouverte sans coût.

L'ADR 0001 a correctement diagnostiqué que le projet est plus une vitrine
qu'un SaaS à vendre. Mais elle a sur-corrigé en faisant du multi-cloud le
**livrable principal**. La vitrine la plus crédible pour le positionnement
"shipper" est un produit focalisé qui marche, pas une démo abstraite.

## Decision

### 1. Positionnement et roadmap : Azure-first, multi-cloud comme contenu V2 conditionnel

**V1 (sprint pré-launch — déjà en cours)** :

- Pitch reste **"plug-and-play analytics for Azure App Insights"**.
  Spécifique, mémorable, douleur ressentie en 30 secondes par tout dev
  Azure, distribution écosystème MS gratuite.
- Renommage en `keren-analytics` (cf. ADR 0001 § Decision 2) : maintenu.
  Le nom signe le mainteneur sans s'enfermer dans un cloud, **mais la tagline
  reste Azure-first** : *"plug-and-play analytics for Azure App Insights"*.
- Refacto `src/azure/` → `src/providers/azure/` : maintenu, mais
  **comme bénéfice secondaire de clarté**, pas comme préalable à un
  multi-cloud immédiat.
- Pas d'adapter Scaleway / AWS / GCP code-side en V1. Les références dans
  `architecture-multicloud.md` deviennent des **future-proofing notes**, pas
  des engagements de livraison.
- Hard launch sur Azure ecosystem : Show HN, awesome-azure PR, Reddit
  r/azure, dev.to, MS for Startups marketplace, MVP outreach. Le
  `launch-strategy.md` redevient le plan tactique principal (cf. § sur les
  bannières status plus bas).

**V2 (mois 3-6, conditionnel à la traction V1)** :

- Si V1 a généré ≥ quelques centaines de stars, des issues d'utilisateurs
  réels, des inbound (recruteurs, conseil, design partners) → **alors**
  ajouter un second adapter (Scaleway en priorité, pour le narratif EU /
  souverain).
- L'asset éditorial associé : *"J'ai porté mon outil Azure-natif sur
  Scaleway en 2 semaines — voici l'archi qui a rendu ça possible."* Beaucoup
  plus fort comme contenu portfolio que "j'ai construit multi-cloud dès le
  départ", parce que ça démontre dans le bon ordre : produit qui ship → archi
  qui tient.
- AWS / GCP : seulement si la demande émerge spontanément, ou si le
  benchmark cross-cloud est l'article qu'on veut écrire. Pas de planning
  rigide.

Les gates de traction du `launch-strategy.md` § 3 (T+90 stars/installs) ne
pilotent pas l'ouverture multi-cloud non plus — ils sont juste une heuristique
qualitative pour décider si la V2 vaut le coup.

### 2. Hébergement : Azure (Container Apps), pas Scaleway

**Décision** : héberger la démo publique sur **Azure Container Apps** (région
~~West Europe~~ → *France Central*, cf. amendment 2026-05-10), avec crédits
Microsoft for Startups Founders Hub.

Justifications :

1. **Cohérence audience.** Le visiteur est un dev Azure. Démo Azure-natif =
   muscle memory respectée, friction nulle.
2. **MS Founders Hub = coût démo nul.** Crédits couvrent Container Apps + ACR
   + Key Vault + DNS pour les 4 ans. Au pire, à l'expiration, le scale-to-zero
   de Container Apps maintient le coût marginal proche de zéro.
3. **Pickup écosystème MS facilité.** MVPs, DevRel, MS for Startups
   marketplace sont 10× plus enclins à promouvoir un outil Azure-natif
   end-to-end (audience + données + infra).
4. **Option acquihire / partnership Microsoft conservée gratuitement.**
   Faible probabilité absolue, mais non nulle, et le coût pour la garder
   ouverte est nul.
5. **Cohérent avec le pitch principal.** Si on dit "j'aime votre écosystème,
   voici un outil pour ses utilisateurs", l'héberger ailleurs envoie un signal
   contradictoire.

Scaleway reste documenté comme **alternative pour self-hosters EU-souverains**
(banques, public sector, GDPR-strict) et comme **cible de portage V2**.

### 3. Souveraineté EU — recadrage

L'argument souveraineté n'est pas perdu, il change de support :

- Pour buyers EU-régulés (banques, public, santé) : l'argument n'est pas "ma
  démo tourne en France", c'est **"l'outil est self-hostable, MIT, KQL-only,
  no raw data leaves your tenant"**. Eux déploient le Docker chez eux, sur
  leur infra (souvent on-prem ou cloud souverain à eux). L'hébergement de la
  démo n'est pas dans leur champ de décision.
- Pour le narratif vitrine : la souveraineté devient le sujet de l'article
  V2 ("portage Scaleway"), pas le pitch V1.

Azure France Central (datacenters en France) reste un cloud Microsoft, pas
souverain au sens strict. C'est assumé pour V1 — la promesse souveraineté
forte passe par le self-host, pas par notre démo publique.

### 4. Terraform / IaC : Azure uniquement en V1

L'ADR 0003 prévoyait `terraform/{scaleway,azure,aws,gcp}/`. **Réduit à V1** :

- **Bicep retenu** (cf. amendment 2026-05-10) — `infra/main.bicep`
  + `deploy/azure-deploy.sh`. Plus court (~280 lignes pour Container Apps
  + ACR + Log Analytics + MI), idiomatique Azure, secrets `@secure()`
  natifs. Le critère "déploiement reproductible en une commande" tient :
  `./deploy/azure-deploy.sh --client-id ... --client-secret ...`.
- Workflow `deploy-azure.yml` GH Actions seulement.
- Les dossiers `terraform/scaleway/`, `aws/`, `gcp/` n'existent pas en V1.
  Ils apparaîtront avec leur adapter respectif si la V2 est déclenchée.
- L'ADR 0003 dans son ensemble est **archivée pour V1** — sa logique reste
  valable pour V2+, on la ressortira à ce moment-là.

### 5. Domaine : `analytics.keren.run` maintenu

Décision DNS d'ADR 0002 § 7 maintenue : `https://analytics.keren.run`
pointe sur la démo, peu importe le cloud d'hébergement. Seul l'enregistrement
DNS change : `CNAME analytics` → endpoint Azure Container Apps (au lieu de
Scaleway).

### 6. `launch-strategy.md` : tactiques restaurées, gates SaaS toujours hors-sujet

L'ADR 0001 avait apposé un bandeau "partiellement superseded" sur
`launch-strategy.md`. Avec ce retour à l'angle Azure-first :

- **Les tactiques de § 1, 2, 4-12** (OSS hard launch, MS ecosystem pickup,
  Show HN, awesome-azure, Reddit, dev.to, runbook launch-day) **redeviennent
  pleinement actives**. C'est le plan opérationnel V1.
- **Les gates de § 3** (T+90 décision SaaS hébergé) **restent neutralisés** —
  on ne bascule pas en SaaS payant, on reste OSS-first vitrine. Mais ces
  gates servent maintenant comme heuristique qualitative pour décider de
  lancer la V2 multi-cloud (cf. § 1 ci-dessus).

Le bandeau de `launch-strategy.md` sera mis à jour pour refléter cette
distinction.

## Consequences

### Positives

- **Vélocité produit restaurée.** Sprint pré-launch (~80h, déjà bien avancé)
  reste sur ses rails. Pas de mois supplémentaires à coder des adapters
  spéculatifs avant de pouvoir launcher.
- **Pitch resserré et mémorable.** "Plug-and-play 2-min Azure App Insights
  dashboard" passe en une phrase, déclenche la reconnaissance de douleur.
- **Distribution gratuite réactivée.** L'écosystème MS amplifie un projet
  Azure-natif end-to-end.
- **Coût hébergement nul** via MS Founders Hub.
- **Récit marque dans le bon ordre** : "j'ai shippé un truc utilisé" d'abord,
  "j'ai montré que ça généralise" en V2 si pertinent. Plus crédible pour le
  positionnement product engineer.
- **Option acquihire / MS partnership conservée gratuitement.**

### Négatives / risques

- **Le narratif souveraineté EU pour V1 perd en intensité.** Atténué par
  l'argument self-host pour les buyers régulés (qui de toute façon ne
  consomment pas la démo publique).
- **L'effort fait sur les ADR 0001/0002/0003 et le commit de pivot
  multi-cloud doit être partiellement défait** côté docs. Mineur (3-4
  fichiers) et utile pour la trace publique.
- **Les items maintainer-todo Scaleway** (compte, IAM, OpenTofu Scaleway, DNS
  Scaleway) sont à remplacer par leurs équivalents Azure + MS Founders Hub.
- **Le risque "ça reste Azure-only pour toujours"** existe : si la V1 ne
  génère pas de traction, la V2 n'arrive jamais et l'archi multi-cloud reste
  théorique. Acceptable : on aura quand même appris quelque chose, et l'archi
  cloud-agnostic des docs reste un asset éditorial même sans 2e adapter.

### Neutres

- Renommage `keren-analytics` maintenu.
- Domaine `analytics.keren.run` maintenu.
- Refacto `src/azure/` → `src/providers/azure/` maintenu (bénéfice de clarté
  immédiat, pas un coût significatif).

## Plan d'exécution révisé

| Phase | Livrable | Statut |
|---|---|---|
| Sprint pré-launch | Polish UI / AI surfaces / docs / landing | En cours |
| MS Founders Hub | Soumettre la candidature, obtenir crédits + badge | À faire (≤ 1h) |
| Rename | Repo `easy-analytics-for-azure` → `keren-analytics`, MAJ refs | DONE |
| Refacto provider | `src/azure/` → `src/providers/azure/`, formaliser interface | Reporté V2 (cf. ADR 0001) |
| Hébergement Azure | Bicep `infra/main.bicep` + script `deploy/azure-deploy.sh` | DONE 2026-05-10 (manuel) |
| GH Actions OIDC `deploy-azure.yml` | Automatiser le déploiement | À faire |
| DNS `analytics.keren.run` | CNAME → FQDN Azure Container Apps + managed cert | À faire |
| Hard launch | Show HN, awesome-azure, Reddit, MS DevRel outreach | Phase B (post-Phase A stabilisée) |
| **GATE** : signaux de traction | ≥ qq centaines stars, issues utilisateurs réelles, inbound | T+90 |
| Adapter Scaleway + article portage | Conditionnel à la gate | V2 si gate passée |
| Adapter AWS + GCP + benchmark | Conditionnel à la demande / appétit | V2+ optionnel |

## Notes

Cette ADR ne décide PAS :

- Le détail de la candidature MS Founders Hub (à remplir par le mainteneur).
- Le timing exact du rename par rapport au sprint pré-launch en cours
  (cf. `maintainer-todo.md`).

(Bicep vs Terraform : tranché en faveur de Bicep — voir amendment en tête.)

## Lessons learned (pour la trace)

Le retournement entre ADR 0001-0003 et celle-ci est **utile à laisser visible
publiquement**. Il documente une heuristique réelle de solo-dev : *"avant de
faire du multi-cloud-by-design, vérifier qu'on a un produit que des gens
utilisent vraiment dans le cloud principal"*. Cette boucle de réflexion fait
elle-même partie du contenu portfolio — un repo public où on voit l'auteur
sur-corriger puis se reprendre est plus crédible qu'un repo où tout semble
linéaire et planifié.
