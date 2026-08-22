# Plan — Refonte mobile Keren (correctifs M0→M3, 9 commits + 1 optionnel)

> **Statut** : plan approuvé par le maintainer le 2026-08-21, exécuté sur la
> branche `claude/mobile-nav-audit-ldnxes` dans l'ordre C1→C9 (C10 laissé
> optionnel / hors périmètre). Ce document est la référence figée : chaque
> commit de la série porte le préfixe indiqué et se vérifie par la section
> « Vérif » correspondante.

## Context

L'audit mobile du 2026-08-21 (`docs/backlog/mobile-ux-audit.md`, même branche,
+ rapport artifact) a reproduit et mesuré les bugs signalés sur iPhone :
tiroir KPI 520 px `position:absolute` ancré au document (titre coupé
« …sitors », écran blanc si ouvert après scroll), palette ⌘K même défaut,
barre sticky de raccourcis clavier (56 px) sur toutes les routes, en-tête
dashboard entassé à ≤720 px, éditeur de mapping ~570 px de large sur 390 px,
30/31 cibles < 44 pt, zéro plomberie plateforme (safe-area / svh /
touch-action / 16 px / overscroll).

Décisions maintainer (2026-08-21) : barre de statut **masquée complètement sur
tactile** ; périmètre **M1+M2+M3** + 2 extras (fix sélection mock, smoke-test
Playwright CI — `playwright` accepté en devDependency).

Découvert pendant la planification, vérifié deux fois (lecture directe +
revue d'architecture) : **les trois toggles de vues du dashboard sont cassés
partout, desktop inclus** — `toggle.closest(".panel")` (`public/app.js:1848`)
ne matche plus rien depuis la reskin D v2 (les conteneurs sont `.dash-panel`,
aucune classe `panel` dans `index.html`) ⇒ TypeError à chaque clic sur les 6
boutons (geo Map/Chart, Campaigns/Parameters, Flow/Table) : le bouton change
d'état mais la vue ne bascule jamais. En plus, `targetMap`
(`app.js:1852-1857`) n'a pas d'entrées `campaign-*`.

## Verdicts de la revue d'architecture (risques vérifiés, preuves en code)

1. **`position:fixed` sain** : aucun `transform`/`filter`/`backdrop-filter`/
   `perspective`/`will-change`/`contain` sur les chaînes d'ancêtres de
   `#dashboardPanel` ni du shell setup (tous les hits sont des feuilles ; le
   seul `backdrop-filter` est sur `.dash-cmdk-scrim` lui-même,
   `styles.css:5367`, sans conséquence). La conversion absolute→fixed est
   viable telle quelle.
2. **z-index — un vrai conflit** : `.svc-switch-menu` (absolute, z 200, dans
   le stacking context racine) peindrait AU-DESSUS du tiroir (45) et de la
   palette (40) une fois fixed. Correctif : `.dash-cmdk-scrim` 40→**220**,
   `.dash-drill-scrim` 44→**230**, `.dash-drill` 45→**231** (reste sous
   `.kr-confirm-scrim` 1000 et `.d2-cfg-menu` 1100, voulu). **Leaflet est
   piégé** par `.map-container { z-index:1 }` (`styles.css:2301`) + le
   `position:relative` posé au runtime par Leaflet : ses panes/contrôles
   (z 200-1000 internes) ne peuvent rien recouvrir — ne pas toucher ce
   `z-index:1`, ajouter un commentaire de garde.
3. **Toggles** : cf. Context — fix par `.closest(".dash-panel")` + garde null
   + id dérivé par convention (couvre les 6 vues, supprime le `targetMap`).
4. **Chart.js vendorisé = v4.4.6** : `events` par défaut incluent
   `touchstart`/`touchmove` (+ mapping touch→mouse) et aucune config dans
   `app.js` ne les retire — les tooltips canvas répondent déjà au tap.
   Rien à faire sur trend/donut/geo/timings.
5. **Table→cartes (CSS-only) tient** : les inputs custom sont dans les mêmes
   `<td>` (pas de ligne séparée), tout le JS cible `tr[data-field]` /
   `closest("tr")` (insensible au display), `colspan=4` inerte en block,
   aucun `display:table-*` concurrent. Deux compagnons **obligatoires** :
   relâcher `.map-status { white-space: nowrap }` (`styles.css:3956`) et
   contraindre `.map-select` en largeur (les libellés longs
   d'`optionLabel()`, `setup.js:899-907`, créent la largeur intrinsèque qui
   cause les 570 px).
6. **Scroll-lock sans interférence** : seuls 2 usages scroll dans `app.js` —
   `scrollIntoView` du menu service (`:893`, scoped à sa liste) et
   `focusSignalPrompt` (`:3161`, s'exécute après `closeCmdk()` donc après
   unlock). Aucun listener scroll, aucun `window.scrollY`. Le positionnement
   des menus fixed utilise `getBoundingClientRect` (viewport-relative,
   insensible au lock). Nuance desktop : le lock retire la scrollbar
   (~15 px de reflow) — compenser ou assumer (le tiroir couvre le bord droit).
7. **Sankey : vérifier seulement** — iOS synthétise
   `mouseenter/mousemove/mouseleave` au tap sur les listeners existants
   (`app.js:2960-2976, 2995-3004`) ; les tooltips apparaissent déjà. Pas de
   commit dédié ; 5 lignes de `click` seulement si le test device montre un
   trou. **Leaflet : les popups s'ouvrent déjà au tap** (`bindPopup`
   `app.js:2005`, click par défaut ; le `mouseover/mouseout` `:2006-2007`
   n'ajoute que le survol) — seul `dragging` est à traiter.

## Conventions transverses

- **Breakpoint largeur : 720 px** (celui du fichier — blocs existants
  `styles.css:4418, 4496, 4566, 5195`). Pas de nouveau seuil. Les nouvelles
  règles dashboard vivent près de `styles.css:5195` ; les règles setup près
  des règles mapping `:3893-3965`.
- **Modalité d'entrée** (indépendante de la largeur) :
  `@media (hover: none), (pointer: coarse)` pour masquer l'UI clavier et
  agrandir les cibles. Classe utilitaire `.kbd-hint` pour les glyphes inline.
- Présentation pure : aucun contrat de mapping touché (les « 7 sync points »
  de `docs/backlog/manual-mapping-config.md` restent intacts), pas de bump de
  `mappingVersion`, pas de nouvelle dépendance runtime.
- Style repo : ESM, extensions dans les imports, 2 espaces, doubles quotes,
  point-virgules ; commits `type(scope): sujet impératif` + corps « pourquoi ».

## Commits (ordre d'exécution)

### C1 — `fix(mock): GUID-shaped subscription ids so /azure/select accepts mock resources`
- **Fichier** : `src/providers/azure/mockData.js` uniquement (`mock-sub`
  n'apparaît nulle part ailleurs ; ni `mockClient.js` ni les tests ne
  dépendent du littéral).
- Remplacer `mock-sub` par un GUID fixe (ex.
  `00000000-0000-4000-a000-000000000001`) dans `resourceId`, **`workspaceId`**
  (les deux sont validés par `/azure/select`, `src/server.js:653-661`) et
  `subscriptionId`. Garder `mock-rg`/`mock-appinsights`. Ne PAS assouplir
  `AZURE_RESOURCE_ID` (`src/server.js:214-219`) — garde SSRF.
- **Vérif** : `npm test` vert ; login mock → hub → « Configure… » → plus de
  « Malformed resource id. ». Watch : une sélection/scan persistée en `data/`
  avec l'ancien id repasse « unconfigured » (dev only, re-scan suffit).

### C2 — `fix(dashboard): repair view toggles broken by the D v2 reskin`
- **Fichier** : `public/app.js:1848-1861`.
- `toggle.closest(".panel")` → `toggle.closest(".dash-panel")` + `if (!panel)
  return;`. Remplacer `targetMap` par la convention (déjà décrite en
  commentaire `:1851`) :
  `` const targetId = `${group}${viewId[0].toUpperCase()}${viewId.slice(1)}View` ``
  — couvre les 6 ids (`geoMapView`, `geoChartView`, `campaignOverviewView`,
  `campaignParamsView`, `flowSankeyView`, `flowTableView`). Garder la branche
  `invalidateSize` (`:1863-1865`).
- **Vérif** : desktop, les 6 boutons basculent sans TypeError console ; la
  carte se redimensionne au retour sur Map.

### C3 — `fix(dashboard): viewport-fixed drill drawer and command palette with body scroll lock`
- **Fichiers** : `public/styles.css` (`:5361-5368, 5370-5377, 5448-5456,
  5480-5488, 5503-5508` + bloc ≤720 près de `:5195`), `public/app.js`
  (`:347-358, 379-397` + util ~12 lignes).
- CSS :
  - `.dash-cmdk-scrim` : `position: fixed; z-index: 220;` ; à ≤720 px
    `padding: 12px 12px 0` (au lieu de `padding-top: 96px` — garde le champ
    visible au-dessus du clavier iOS) ; `.dash-cmdk` : à ≤720 px
    `width: 100%; max-width: calc(100vw - 24px)`.
  - `.dash-drill-scrim` : `position: fixed; inset: 0; z-index: 230;`.
  - `.dash-drill` : `position: fixed; inset: 0 0 0 auto;
    width: min(520px, 100vw); z-index: 231;`. À ≤720 px : bottom sheet —
    `inset: auto 0 0 0; width: auto; max-height: 85vh; max-height: 85svh;
    border-left: none; border-top: 1px solid var(--ghost-hover-border);
    border-radius: 16px 16px 0 0;
    padding-bottom: max(16px, env(safe-area-inset-bottom));`.
  - `overscroll-behavior: contain` sur `.dash-drill-body` et
    `.dash-cmdk-list` (+ `max-height: 60vh; max-height: 60svh;
    overflow-y: auto` sur la liste).
  - Pointer coarse : `.dash-drill-close { min-width: 44px; min-height: 44px }`.
  - Commentaire de garde sur `.map-container` (`:2301`) : « z-index:1 +
    position:relative posé par Leaflet piègent ses panes z:400-1000 — ne pas
    retirer ».
- JS : util `lockScroll()`/`unlockScroll()` — sauvegarde `window.scrollY`,
  pose `position:fixed; top:-y px; left:0; right:0; width:100%` sur `body`,
  restaure + `scrollTo(0, y)` au unlock ; compteur anti-réentrance. Appels :
  `openDrill`/`openCmdk` ; **première ligne** de `closeDrill`/`closeCmdk`
  (jamais d'early-return avant — sinon page gelée ; `runCmdk` `:360-364`
  ferme AVANT d'exécuter la commande, donc `focusSignalPrompt` `:3161`
  scrolle après restauration — vérifié sain).
- **Vérif** : 390×844 — drill ouvert en haut ET après scroll 1200 px : sheet
  entière visible, fond gelé, fermeture restaure le scroll exact ; palette
  idem (ouvrir via `window.openCmdk()` en profil tactile) ; Esc + scrim
  ferment. Desktop 1280 px : panneau latéral fixe correct même scrollé ;
  forcer menu service ouvert + drill → le drill peint dessus (z 231 > 200) ;
  `.d2-cfg-menu`/confirm restent au-dessus (1100/1000).

### C4 — `feat(mobile): hide keyboard-only chrome on touch devices`
- **Fichiers** : `public/styles.css` (un bloc
  `@media (hover: none), (pointer: coarse)`), `public/index.html:621`.
- Masquer (`display:none`) : `.d2-cmdbar` — les 3 barres (dashboard
  `index.html:1240-1252`, hub `app.js:1341-1353`, setup `setup.html:151`) ;
  chaque CTA de barre est un duplicata vérifié d'un CTA du flux : hub
  `#d2CmdConnectBtn` ≡ `#d2ConnectBtn` (`app.js:1491-1492`), setup
  `cmdContinue` ≡ `#scanningContinue` (`setup.js:159`), `cmdReview` ≡
  `#findingsContinue` (`:207`), `cmdSave` ≡ `#validateAcceptAll`/
  `#validateSaveOverrides` (`setup.html:133-137`), étape « complete » sans
  CTA (`setup.js:230`) — rien n'est perdu. Aussi : `.d2-mark-tag` (couvre le
  chip hub `app.js:1307` ET `#dashCmdkBtn` `index.html:568` — même classe,
  son style inline ne fixe pas display), `#d2FilterBtn` (« ⌘K Filter »,
  `app.js:1324` — le champ de recherche reste), `.d2-search-kbd`
  (`app.js:1335`), `.d2-cfg-primary-kbd` (« ↵ », `app.js:1395`),
  `.dash-cmdk-foot` (`index.html:1260-1264`), **`.prompt-action-icon`**
  (glyphe ⌘ du split-button partagé, `promptActionButton.js:73` — sinon
  l'assertion smoke C9 échoue sur Readiness/setup), `.kbd-hint`.
- `index.html:621` : `⌘E Export` → `<span class="kbd-hint">⌘E</span> Export`
  (le raccourci clavier reste actif, `app.js:445-450`).
- **Vérif** : profil tactile — zéro glyphe ⌘/↵/↑↓/esc rendu sur `/`,
  `/services`, `/preview`, `/setup` ; desktop inchangé (laptops à écran
  tactile : pointer primaire fine + hover ⇒ inchangé aussi).

### C5 — `feat(mobile): stack dashboard header controls and make sub-tabs scrollable`
- **Fichier** : `public/styles.css` (étendre le bloc `:4566-4570` + subtabs
  près de `:4633`), ≤720 px.
- **Scoper au dashboard** (le `.d2-pageheader-r` est partagé avec hub et
  setup — 2-3 boutons seulement là-bas) :
  - générique : `.d2-pageheader-r { flex-wrap: wrap; }` (filet hub/setup) ;
  - `#dashboardPanel .d2-pageheader-r { display: grid;
    grid-template-columns: 1fr 1fr; gap: 8px; }` ;
  - `#dashboardPanel .dash-range { grid-column: 1 / -1; display: grid;
    grid-template-columns: repeat(3, 1fr); }`, `.dash-range-btn
    { min-height: 44px; text-align: center; }` (font 13 px) ;
  - `#dashboardPanel .d2-cfg-split { grid-column: 1 / -1; }`
    (`.d2-cfg-primary` est déjà `flex:1`, `:4244`) ; Export + Change se
    placent côte à côte automatiquement.
  - `.dash-subtabs { display: flex; overflow-x: auto; scrollbar-width: none; }`
    + `::-webkit-scrollbar { display: none }`, `.dash-subtab { flex: 0 0 auto;
    min-height: 44px; }` (l'onglet coupé au bord = l'affordance de scroll).
  - `.kpi-hint` (`#kpiVisitorsHint`, `styles.css` vers `:571`) : padding +
    `min-height` pour une cible décente.
- **Vérif** : 390 px et 360 px — « Modifier le mapping » sur 1 ligne, plage
  en 3 segments pleine largeur lisibles, badge Readiness accessible en
  glissant la rangée d'onglets, zéro débordement page ; hub/setup : en-têtes
  wrappent proprement ; desktop >720 identique.

### C6 — `feat(mobile): platform correctness — safe areas, svh, 16px inputs, touch-action, theme-color`
- **Fichiers** : `public/index.html` (`:5, :9`), `public/setup.html`
  (`:5, :9`), `public/styles.css`, `public/theme-init.js`, `public/app.js`
  (`:141-143`), `public/setup.js` (`:1200-1208`).
- `viewport-fit=cover` sur les 2 metas viewport (jamais de
  `maximum-scale`/`user-scalable=no`).
- `.d2-page` (`:4554-4555`) : `min-height: 100vh; min-height: 100svh;`
  (fallback d'abord).
- `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
  overscroll-behavior-y: contain; }` (le pull-to-refresh Android rechargeait
  la SPA — perte assumée, le refresh data existe dans l'UI).
- `touch-action: manipulation` sur `button, a, select, input, [role="tab"]`.
- `-webkit-tap-highlight-color: transparent` + états `:active` visibles
  (fond/`brightness`) sur `.dash-subtab`, `.dash-range-btn`,
  `.d2-headeraction`, `.view-toggle-btn`.
- 16 px à ≤720 px / coarse (cibler les classes — un `input` nu perd en
  spécificité contre `.setup-input`) : `.setup-input` (`:3898`),
  `.d2-search input` (`:4136`, 12,5 px), `.dash-cmdk-input` (`:5382`, 15 px),
  `.svc-switch-filter` (`:5613` — la classe est sur l'input, `app.js:848`).
- Cibles coarse ≥44 px (padding) : `.dash-range-btn` (`:4683`),
  `.dash-subtab` (`:4641`), `.view-toggle-btn` (`:2204` → padding 8px 14px),
  `.d2-headeraction` (`:4103`), `.d2-cfg-primary`/`.d2-cfg-caret`
  (`:4243`/`:4251`), `.setup-row-btn` (`:3909`), `.dash-filterchip-x`
  (`:5301`), `.theme-toggle`. Plancher 24 px partout. Exception assumée :
  liens d'attribution Leaflet (chrome tiers, texte inline).
- `.onboarding-banner` (`:2839`) : `flex-wrap: wrap` (déborde à 390 px) ;
  contrôler `#previewBanner`/`.first-run-banner` à 390 px en `body.d2-route`
  (padding container annulé `:4580`).
- **theme-color** : PAS une simple paire `media="(prefers-color-scheme)"`
  (le toggle manuel localStorage diverge de l'OS). Un seul meta par page +
  helper `window.__setThemeColorMeta(dark)` dans `theme-init.js` (clair
  `#f8f9fb`, sombre `#0f1117` — valeurs de `--bg`, `styles.css:26/:67`),
  appelé au boot et depuis les 2 toggles (`app.js:141`, `setup.js:1207`).
- **Vérif** : profil iOS — aucun zoom au focus (hub search, palette, éditeur) ;
  couleur de chrome navigateur suit le toggle sur les 2 pages ; DevTools :
  plus de cible <24 px sur les contrôles listés.

### C7 — `feat(setup): card-per-field mapping editor at phone widths`
- **Fichier** : `public/styles.css` uniquement (bloc ≤720 près de
  `:3893-3965`), scoped `#validateTable` — aucun changement JS.
- `#validateTable, #validateTable tbody, #validateTable tr, #validateTable td
  { display: block; }` ; `#validateTable thead { display: none; }` ;
  `#validateTable tr[data-field] { border: 1px solid var(--border);
  border-radius: 10px; padding: 12px; margin-bottom: 10px; }` ; `td
  { border-bottom: none; padding: 4px 0; }` ; `.map-group-row td` en titre de
  section (padding 16px 0 6px — le `colspan=4` émis `setup.js:945-948` est
  inerte en block).
- Compagnons obligatoires : `.map-status { white-space: normal; display: flex;
  gap: 8px; align-items: center; flex-wrap: wrap; }` (base `:3956`) ;
  `.map-select, .map-custom-source, .setup-input-mono { width: 100%;
  max-width: 100%; }` (tue la largeur intrinsèque des libellés
  d'`optionLabel()`). `.map-expr` garde `word-break: break-all` (`:3928`).
- Chrome wizard : `.setup-panel { padding: 20px 16px }` (`:3193`) ;
  `.setup-footer { flex-wrap: wrap; gap: 10px }` (`:4005`) ; `.d2-progress` à
  ≤640 px : masquer `.d2-progress-label` des étapes `:not(.is-active)` —
  **enfants seulement, jamais le container** (`setup.js:142` pose un
  `style.display` inline sur `#setupProgress`) ; `.inv-item` (`:3986`) :
  `word-break: break-word`.
- **Vérif** : `/setup?mode=manual` à 390 px, disclosure ouverte :
  `scrollWidth === innerWidth`, une carte par champ, « ✎ Custom KQL… » →
  les 2 inputs pleine largeur, Test/Reset tapables, preview dans la carte ;
  desktop : table inchangée.

### C8 — `feat(mobile): touch interactions — heatmap readout, map drag, menu clamps`
- **Fichiers** : `public/app.js` (`:2396-2414, :1972-1976, :1188-1201,
  :1248-1260`), `public/styles.css` (`:4269-4271, :5601-5603` + petites
  additions).
- Heatmap (`app.js:2396-2412`, `title` seul) : un listener `click` délégué
  sur la grille — toggle `.is-focused` (CSS existant `:5260`) sur la cellule
  et recopie de son `title` dans une petite ligne de lecture sous/над la
  grille (div texte simple, pas de nouveau composant tooltip). `title`
  conservé pour la souris.
- Leaflet (`:1972-1976`) :
  `dragging: !window.matchMedia("(pointer: coarse)").matches` ; garder
  `zoomControl: true` (WCAG 2.5.7 OK) ; popups déjà au tap — vérifier.
- `.d2-cfg-menu` (les 2 positionneurs `:1188-1194` / `:1248-1253`) : borne
  basse `left = Math.max(12, Math.min(r.left, innerWidth - menu.offsetWidth
  - 12))` ; fermeture sur scroll : `window.addEventListener("scroll",
  closeMenu, { once: true, passive: true })` enregistré dans le même
  `setTimeout` que le click-away (`:1198-1201` / `:1257-1260`) — aujourd'hui
  le menu fixed se détache du caret au scroll (le close-on-scroll est aussi
  un changement de comportement desktop, assumé). CSS : `.d2-cfg-menu
  { max-width: min(360px, calc(100vw - 24px)); min-width: min(300px,
  calc(100vw - 24px)); }` (**le `min-width` bat le `max-width`** — le
  baisser est obligatoire, pas seulement plafonner).
- `.svc-switch-menu` à ≤720 px : `min-width: 0; width: min(420px,
  calc(100vw - 32px));` (même piège min/max, `:5603`).
- Sankey : **aucun code** — événements souris synthétisés au tap par iOS sur
  les listeners existants ; ajouter un toggle `click` (~5 lignes) seulement
  si le test sur device montre un trou.
- **Vérif** : 390 px — tap cellule heatmap → readout « Tue 14:00 · N » ;
  glisser sur la carte scrolle la page, zoom +/− OK, tap marqueur → popup ;
  menus caret/service toujours entièrement à l'écran ; plus de menu orphelin
  après scroll.

### C9 — `test(mobile): Playwright viewport smoke test + CI job`
- **Fichiers** : `scripts/mobile-smoke.mjs` (nouveau — eslint donne déjà les
  globals Node à `scripts/**/*.mjs`, `eslint.config.js:31`), `package.json`
  (devDependency `playwright`, script `"test:mobile"`),
  `.github/workflows/tests.yml` (job parallèle).
- Script (chromium 390×844, DPR 2, `hasTouch: true`) contre
  `BASE_URL || http://localhost:3000` :
  1. zéro overflow horizontal (`scrollWidth ≤ innerWidth + 1`) sur `/`,
     `/services` (après `/auth/login` mock), `/preview` + les 4 onglets
     (clics `.dash-subtab`), `/setup` (attendre
     `#scanningContinue:not([disabled])` — pas de timeout arbitraire),
     `/setup?mode=manual` **avec la disclosure `#mappingDisclosure` ouverte
     explicitement** (elle n'est auto-ouverte qu'en low-confidence/
     advancedMapping, `setup.js:926-938`) ;
  2. drill + palette entièrement dans le viewport, ouverts en haut ET après
     `scrollTo(0, 600)` — **appeler `window.openDrill(…)`/`window.openCmdk()`**
     (déclarations top-level de script classique, accessibles ; les points
     d'entrée UI sont masqués en profil tactile par C4) ;
  3. aucun texte visible matchant `[⌘↵]|↑↓` (couvre barres, chips, foot,
     icônes) ;
  4. tout `input/select` visible a `font-size ≥ 16px` ;
  5. zéro `pageerror` sur le parcours (attrape les régressions type C2).
  Sortie non-zéro avec liste des échecs par route.
- CI : job `mobile-smoke` (ubuntu, node 22, `npm ci`,
  `npx playwright install chromium --with-deps`, serveur mock en arrière-plan
  `NODE_ENV=test`, attente `/healthz` — existe, `src/server.js:1519` —,
  `npm run test:mobile`). Coût ~+1,5 min.
- **Vérif** : job vert sur la branche ; remettre `width: 520px` sur
  `.dash-drill` en local doit le faire échouer (preuve qu'il mord).

### C10 (optionnel) — `chore(css): drop dead interaction CSS and legacy hub search markup`
- `.dash-tip*` (`styles.css:5215-5253`) + `.dash-trend-guide/-dot`
  (`:5255-5257`) : spec `handoff-dashboard/` jamais implémentée, zéro
  référence ; `.d2-cta-kbd` (`:4232-4236`) ; markup search legacy
  `index.html:532-535` (écrasé par `renderResources` qui remplace
  `resourcePanel.innerHTML`, `app.js:1295`, et recrée `#resourceSearchInput`
  `:1334`). Grep de chaque sélecteur avant suppression.
- Le gros nettoyage CSS setup legacy (~600 lignes, `:3132-3187, 3202-3404,
  3505-3614, 3617-3631, 3740-3890` + `@media :4017-4021` qui ne cible que du
  mort), la migration `<dialog>` (P2-8) et le repli topbar Docs/Logout (P1-7)
  restent **hors périmètre** — PR séparée si souhaitée plus tard.

> **Suite : traité.** Ces trois points ont fait l'objet de la série D
> (`docs/backlog/nav-dialog-cleanup-plan.md`, commits `dcd810c` → `81ff96d`) :
> menu avatar, migration des 4 modales vers `<dialog>` natif, purge de
> 826 lignes de CSS mort. Restent pour une passe ultérieure les orphelins
> `.setup-container`/`-resource-*`/`-pill*`/`-gap*`/`-cell-*`/`-confidence*`/
> `-origin*` et `.dash-trend-*` (non référencé, hors périmètre vérifié de D3),
> plus la décision produit sur `.resource-pill`.
>
> **`.resource-pill` : tranché le 2026-08-22.** La pilule est supprimée. Son
> état (le nom du service) est remonté dans une variable de module
> `selectedServiceName` (`app.js`), le bouton Change du dashboard appelle
> directement `clearSelectedResource()` au lieu de relayer un clic synthétique
> vers le bouton invisible, et les deux liens Re-scan / Mapping — déjà morts,
> remplacés par le split-button Configuration — partent avec le markup
> (`index.html`) et les 4 règles CSS (`styles.css`). Le smoke couvre désormais
> « Change ramène au hub », le trou qui rendait ce piège invisible. La navbar
> legacy elle-même reste : 3 états de bord l'affichent encore.

## Watchlist régressions (à contrôler pendant l'exécution)

- **C3** est le plus sensible : (a) unlock toujours en première ligne des
  close — un early-return gèlerait la page ; (b) reflow ~15 px à l'ouverture
  (scrollbar retirée) — compenser ou assumer ; (c) `.skip-link` (z 1000) peut
  passer devant le tiroir au focus clavier — acceptable ; (d) vérifier que
  confirm (1000) et cfg-menu (1100) restent au-dessus du tiroir (231).
- **C4** : laptops hybrides à pointeur primaire coarse (rare) perdent la
  cmdbar — voulu. Desktop classique inchangé.
- **C5** : vérifier le wrap de l'en-tête findings du wizard (3 boutons,
  `setup.js:204-208`).
- **C6** : `touch-action` sur `a` désactive le double-tap-zoom des liens
  (voulu) ; le meta theme-color remplace le bleu de marque sur Android
  (voulu) ; rien d'inline ajouté (CSP intact).
- **C7** : règle progress-labels enfants-seulement vs display inline du
  container (`setup.js:142`).
- **C8** : close-on-scroll des menus = changement desktop assumé ;
  `dragging` coupé uniquement en coarse.
- **C9** : ancrer les attentes sur des états DOM
  (`#scanningContinue:not([disabled])`), jamais des timeouts secs.

## Vérification globale (fin d'exécution)

1. `npm test` (260 tests serveur) — impact attendu nul (C1 ne touche que
   mockData).
2. `npm run test:mobile` vert (C9).
3. Parcours manuel emu tactile 390×844 : login mock → hub → Configure →
   wizard 4 étapes → dashboard 4 onglets → drill + palette + menus + export →
   `/setup?mode=manual` → éditer un champ → Test → Save.
4. Desktop 1280 px : aucun changement visuel hors corrections voulues
   (toggles réparés, drill fixed, menus clampés/fermés au scroll) ; cmdbar
   présente ; ⌘K/⌘E/R fonctionnels.
5. **Sur iPhone réel (maintainer)** : Safari — barre d'outils dynamique
   (svh), clavier + palette, safe-area en paysage, pull-to-refresh désactivé,
   bottom sheet du drill.
