# Plan — Série D : menu avatar, `<dialog>` natif, purge CSS

> **Exécution** : sur la même branche `claude/mobile-nav-audit-ldnxes`, 4 commits
> D1 → D2a → D2b → D3. Étape 0 : committer ce plan dans
> `docs/backlog/nav-dialog-cleanup-plan.md`. À CHAQUE commit : `npm test` (260)
> + `npm run lint` + `npm run test:mobile` verts — le smoke ne doit jamais être
> affaibli pour passer.

## Context

La série C (mergée, cf. `docs/backlog/mobile-ux-fix-plan.md`) a corrigé le
mobile. Trois chantiers laissés hors périmètre sont maintenant demandés :

1. **Menu avatar** — `Logout` est un onglet collé à `Services`/`Docs` dans deux
   topbars ; depuis la série C ces cibles font 44 px côte à côte sous le pouce,
   et le POST `/auth/logout` détruit la session sans confirmation. Décisions
   maintainer (2026-08-21) : Docs+Logout repliés dans un menu ouvert par
   l'avatar `··`, **partout** (desktop inclus), **sans** confirmation.
2. **Migration `<dialog>`** — 7 overlays faits main, 6 handlers Escape
   dupliqués, `aria-modal="true"` déclaré sur tiroir et palette **sans** focus
   trap ni `inert` : le balisage ment aux lecteurs d'écran. Périmètre : les
   **4 vraies modales** (tiroir KPI, palette ⌘K, `krConfirm`, `.ai-data-pop`).
   Les 3 menus (`.d2-cfg-menu`, `#svcSwitchMenu`, `.prompt-action-menu`) sont
   des menus, pas des dialogues — inchangés.
3. **Purge CSS mort** — recompte vérifié par sélecteur : **~819 lignes**
   prouvées mortes (494 familles setup/dash legacy + 305 resource-panel
   pré-D v2 dont le markup statique n'est *jamais* rendu + 20 d'extension),
   ~14 % d'un `styles.css` servi non minifié.

Bugs existants découverts pendant l'exploration, corrigés par la série :
- la palette peut s'ouvrir **sous** le scrim du tiroir (⌘K passe tiroir
  ouvert, z 220 < 230) — le top layer natif corrige l'ordre d'empilement ;
- fond non `inert` : cfg-menu (z 1100) et `krConfirm` atteignables au Tab
  par-dessus une modale ;
- `aria-expanded` jamais remis à `"false"` par `closeConfigMenu`
  (`app.js:1167-1175`) ;
- `logout()` sans `.catch` (`app.js:520-523`) : un 500 = ni redirection ni
  message ;
- `setup.html` n'a **aucun** logout aujourd'hui (le menu avatar lui en donne) ;
- les variantes `[data-theme="light"]` des scrims (`styles.css:5386, 5536`)
  sont du CSS mort : le thème light = **absence** d'attribut (`removeAttribute`
  `app.js:138`, `setup.js:1206`) — elles ne matchent jamais.

Sources : rapports d'exploration (fiches des 7 overlays, inventaire des
5 topbars, plages CSS mortes) dans le scratchpad —
`report-aa8df7e03f3c3db6d.md`, `report-a8c976834109e20b9.md`.

## Verdicts d'architecture (à respecter tels quels)

1. **Chemin de fermeture** : l'event `close` de `<dialog>` est **asynchrone**
   (queued task) et `runCmdk` (`app.js:397-400`) ferme PUIS exécute la
   commande (qui peut scroller — `focusSignalPrompt`, `activateTab`). Donc :
   `unlockScroll()` **synchrone dans `closeX()`**, flag idempotent par dialog,
   et un listener `close` en **filet** (Escape natif, force-close) :
   ```js
   let cmdkLocked = false;
   function releaseCmdkLock() { if (cmdkLocked) { cmdkLocked = false; unlockScroll(); } }
   function openCmdk()  { if (!dlg || dlg.open) return; …; dlg.showModal(); lockScroll(); cmdkLocked = true; input.focus(); }
   function closeCmdk() { if (!dlg || !dlg.open) return; releaseCmdkLock(); dlg.close(); }
   dlg.addEventListener("close", releaseCmdkLock);
   ```
   **Pas** de `cancel`+`preventDefault` (les CloseWatcher de Chromium forcent
   la fermeture au 2ᵉ Escape sans ré-émettre `cancel` ; seul `close` est
   garanti). Supprimer **entièrement** la branche Escape du keydown global
   (`app.js:494-498`) — le cancel natif ferme la modale du dessus uniquement.
2. **Resets UA des dialogs** : neutraliser `padding:1em`, `border:solid`,
   `margin:auto`, `max-width/max-height:calc(100%−6px−2em)`,
   `color:CanvasText` (→ `color:inherit`), `width/height:fit-content` selon
   le cas. Palette top-aligned : `margin: 96px auto auto` (mobile
   `12px auto auto`). Tiroir : `inset: 0 0 0 auto` existant fonctionne sur un
   dialog modal, mais exiger `margin:0; padding:0; border:0; border-left:…;
   height:auto; max-height:none; max-width:none`.
3. **Piège display** : `.dash-drill { display:flex }` écraserait le
   `dialog:not([open]) { display:none }` UA → tiroir fermé visible en
   permanence (et smoke rouge). Écrire **`.dash-drill[open] { display:flex;
   flex-direction:column; }`**.
4. **`::backdrop`** : littéraux rgba uniquement (pas de custom properties, pas
   de variantes light — mortes) : cmdk `rgba(0,0,0,0.32)` +
   `backdrop-filter: blur(2px)` ; drill `rgba(0,0,0,0.18)` ; confirm/pop
   `rgba(8,10,16,0.5)`.
5. **Clic-backdrop** : helper unique `wireBackdropClose(dlg, closeFn)` —
   ferme si `e.target === dlg` **ET** coordonnées hors
   `dlg.getBoundingClientRect()` (kr-confirm et ai-data-pop ont
   `padding:24px` : le test target-seul fermerait au clic dans le padding).
6. **Gouttière mobile** : le centrage de confirm/pop venait du scrim
   `padding:24px` → `.kr-confirm { max-width: min(420px, calc(100vw − 48px)) }`,
   `.ai-data-pop { max-width: min(560px, calc(100vw − 48px)) }`.
7. **lockScroll étendu** à krConfirm/ai-data-pop (cohérence iOS ; même
   pattern flag+filet ; le compteur existant absorbe l'empilement).
8. **Smoke vert sans modification des assertions overlays**, à 4 conditions :
   `openCmdk` reste une déclaration top-level (`window.openCmdk`,
   SMOKE:181) ; pas de `cancel`+preventDefault (Escape SMOKE:130) ; flag
   idempotent (body-fixed check SMOKE:134, event `close` < l'attente de
   250 ms SMOKE:131) ; piège `[open]` respecté (sinon OVERFLOW_PROBE rouge).
9. **Avatar ≠ liste 44 px** : ne PAS ajouter `.d2-avatar` au bloc
   `min-height:44px` (le cercle 26 px deviendrait un ovale). Hit-area
   invisible : `.d2-avatar { position:relative }` + en tactile
   `.d2-avatar::after { content:""; position:absolute; inset:-9px; }` ;
   `min-height:44px` sur `.avatar-menu-item` seulement.
10. **Menu avatar clavier** : focus **réel** sur les items (pattern APG
    menu-button), pas le roving virtuel `.is-focus` du svcSwitch — Enter
    devient l'activation native. Escape → `trigger.focus()` ; clic extérieur
    sans restitution (parité svcSwitch).
11. **Listener délégué `[data-action="logout"]` (`app.js:528-534`) : à
    SUPPRIMER** en D1 — ses deux seules cibles sont les onglets retirés ;
    garder le bind direct `logoutButton` (`app.js:525`) pour la navbar
    legacy (3 états de bord).
12. **D3 après D2** : localiser par **sélecteur** (D2a/D2b suppriment des
    plages avant 5790, tout se décale) ; l'ordre décroissant reste la méthode.

## Invariants

- Classes `.dash-cmdk`/`.dash-drill` conservées sur les éléments (sélecteurs
  smoke) ; `openCmdk`/`openDrill` top-level. Navbar legacy intouchée.
- `.resource-pill` **exclue** de la purge (référencée en JS, jamais visible —
  décision produit séparée, à noter dans le message de commit D3).
- Menus non migrés : `.d2-cfg-menu`, `#svcSwitchMenu`, `.prompt-action-menu`.

## D1 — `feat(nav): avatar menu with Docs and Logout on every d2 topbar`

**Fichiers** : `public/avatarMenu.js` (nouveau), `public/index.html`,
`public/app.js`, `public/setup.html`, `public/setup.js`, `public/styles.css`,
`scripts/mobile-smoke.mjs`.

- `avatarMenu.js` : IIFE façon `promptActionButton.js`, expose
  `window.initAvatarMenu(trigger, items)` ; items `{label, href}` →
  `<a role="menuitem" class="avatar-menu-item">`, `{label, onSelect}` →
  `<button …>` ; menu `div.avatar-menu.hidden` `role="menu"` créé dans le
  parent du trigger ; `aria-haspopup="menu"`/`aria-expanded` basculés ;
  open → focus 1ᵉʳ item ; ↑↓ focus réel, Escape → close + `trigger.focus()`,
  clic extérieur (capture, différé `setTimeout 0`), Tab → close ; listeners
  document retirés au close (close() défensif — le hub peut re-render menu
  ouvert) ; labels par `textContent`.
- `index.html` : `:562-563` retirer onglets Docs+Logout ; `:569` span →
  `<span class="d2-avatar-wrap"><button type="button" class="d2-avatar"
  aria-haspopup="menu" aria-expanded="false" aria-label="Account menu">··
  </button></span>` ; `<script src="/avatarMenu.js">` avant app.js (`:1290`).
- `app.js` : `logout()` (`:520-523`) → `try/catch` + redirection dans tous
  les cas ; supprimer le délégué `:528-534` ; template hub `:1351-1352`
  (onglets) et `:1358` (span→wrapper+button) ; bind boot dashboard
  (`#dashboardPanel .d2-avatar`, items `Docs` href + `Logout` onSelect:
  logout) ; **rebind hub après `app.js:1537`** (zone du rebind topbar, pas
  :1487).
- `setup.html` : `:34` span→wrapper+button ; script avant `:156`.
- `setup.js` : dans `init()` (~`:1200`) — items Docs + Logout avec
  `onSelect: async () => { try { await api("POST", "/auth/logout"); } catch {}
  window.location.href = "/"; }` (le helper `api` pose déjà X-CSRF-Token).
- `styles.css` : reset button sur `.d2-avatar` (`:4061` — `border:0;
  padding:0; cursor:pointer; color:inherit; position:relative`) ;
  `.d2-avatar-wrap { position:relative; display:flex; }` ; `.avatar-menu
  { position:absolute; top:calc(100% + 8px); right:0; z-index:200;
  min-width:160px; background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius); box-shadow:0 16px 40px -12px rgba(0,0,0,0.35);
  padding:6px; }` ; `.avatar-menu-item` sur les valeurs de `.d2-cfg-item`
  (`:4281-4287`) + `text-decoration:none` + focus visible + `:hover` ; bloc
  tactile : `::after inset:-9px` sur l'avatar + `min-height:44px` items.
- `mobile-smoke.mjs` : bloc `[avatar menu]` après le check hub (`:162`) —
  **ne pas réutiliser `checkOverlay`** (il scrolle à 600 ; la topbar n'est
  pas sticky, le menu ancré sortirait du viewport → faux négatif). Assertions :
  aucun `[data-action="logout"]`/`a[href="/auth/logout"]` dans `.d2-tabs` ;
  scroll(0,0) → clic `.d2-avatar` → `.avatar-menu` visible, entièrement dans
  le viewport, contient un item Logout ; Escape → `aria-expanded="false"`.

**Vérif** : lint ; serveur mock + `npm run test:mobile` ; manuel desktop —
menu sur les 3 topbars, navigation clavier complète, logout depuis
dashboard/hub/**setup** (nouvelle capacité), Docs navigue ; `npm test`.

## D2a — `refactor(ui): krConfirm and ai-data-pop as native <dialog>`

**Fichiers** : `public/app.js`, `public/styles.css`.

- `krConfirm` (`app.js:538-573`) : `createElement("dialog")`
  `class="kr-confirm"` (scrim+boîte fusionnés, `role`/`aria-modal` retirés —
  implicites) ; garde singleton (`dialog.kr-confirm[open]` → resolve(false)) ;
  append → `showModal()` → lock+flag ; `okBtn.focus()` conservé ; keydown
  document supprimé (`:563-565, :569` — cancel natif) ; boutons posent
  `result` puis `dlg.close()` ; `wireBackdropClose` ; **unique** listener
  `close` → `{ releaseLock(); dlg.remove(); resolve(result); }` (un seul
  resolve, jamais de remove() sans close).
- `openAiDataPopover` (`app.js:1123-1161`) : même transformation
  (`<dialog class="ai-data-pop">`) ; le bouton `:1148` garde
  `kr-confirm-ok ai-data-pop-close`.
- Helper `wireBackdropClose` ajouté près de `lockScroll` (`app.js:300-327`).
- `styles.css` : supprimer `.kr-confirm-scrim` (`:5599-5604`) ; `.kr-confirm`
  + `max-width: min(420px, calc(100vw − 48px)); color:inherit;` ;
  `.ai-data-pop` (`:4301-4307`) + `max-width: min(560px, calc(100vw − 48px));
  color:inherit;` ; `.kr-confirm::backdrop, .ai-data-pop::backdrop
  { background: rgba(8,10,16,0.5); }` ; commentaires `:4300`/`:5598` mis à
  jour + **note servitude** : `.kr-confirm-cancel/-ok` (`:5622-5630`) restent
  vivants tant que `app.js:1148` les référence.

**Vérif** : `npm run test:mobile` inchangé (ces overlays n'y sont pas) ;
manuel — dashboard → caret → « Reconfigure » (confirm/cancel/Escape/backdrop,
résolution de la Promise `:1281-1287`) et « Data sent to the AI » ; hub →
carte → « What data is sent? » ; Tab piégé ; scroll verrouillé pendant,
libéré après.

## D2b — `refactor(ui): drill drawer and command palette as native <dialog>`

**Fichiers** : `public/index.html`, `public/app.js`, `public/styles.css`.

- `index.html:1255-1267` → `<dialog id="dashCmdk" class="dash-cmdk"
  aria-label="Command palette">` contenant directement input/list/foot
  (wrapper + scrim + div fusionnés ; `.hidden` abandonnée) ; `:1270-1279` →
  `<dialog id="dashDrill" class="dash-drill" aria-label="Metric detail">`
  (head+body ; scrim supprimé ; × garde `data-drill-close`).
- `app.js` : open/close des deux au pattern du verdict 1 (gardes `.open`,
  flags, filets `close`) — `openCmdk` reste top-level ; `:411-413` →
  `wireBackdropClose(dashCmdk, closeCmdk)` ; `:463` restreint au bouton × +
  `wireBackdropClose(dashDrill, closeDrill)` ; lecteur `:479` →
  `?.open` ; branche Escape globale `:494-498` supprimée ; **fix aria** :
  mémoriser l'ancre à l'ouverture des cfg-menus (`:1241`, `:1303`) et
  remettre `aria-expanded="false"` dans `closeConfigMenu` (`:1167-1175`).
- `styles.css` : supprimer `.dash-cmdk-scrim` + variante light
  (`:5378-5386`) et `.dash-drill-scrim` + variante (`:5530-5536`) ; réécrire
  le commentaire d'intention `:5373-5377` (top layer — plus de z 220/230/231) ;
  `.dash-cmdk` + `margin:96px auto auto; padding:0; color:inherit;` (z-index
  retiré) + `::backdrop` cmdk ; `.dash-drill` : retirer z-index et
  `display:flex` du bloc de base → **`.dash-drill[open] { display:flex;
  flex-direction:column; }`**, ajouter `margin:0; padding:0; border:0;
  border-left:1px solid var(--ghost-hover-border); height:auto;
  max-height:none; max-width:none; color:inherit;` + `::backdrop` drill ;
  mobile (`:5542-5555`) : drill inchangé (inset/max-height/border-top
  valides), cmdk → `margin:12px auto auto; width:100%;
  max-width:calc(100vw − 24px);` à la place de la ligne scrim.

**Vérif** : `npm run test:mobile` **sans toucher au smoke** (assertion clé du
commit) ; manuel desktop — ⌘K toggle, ↑↓/Enter, Escape, backdrop, drill via
KPI, × ; **empilement** ⌘K-pendant-drill : palette AU-DESSUS (bug scrim
corrigé), 2 Escapes dépilent dans l'ordre, scroll restauré exactement (tester
les 2 ordres de fermeture) ; `aria-expanded` des carets retombe ; `npm test`.

## D3 — `chore(css): purge verified dead selectors and static resource-panel markup`

**Fichiers** : `public/styles.css`, `public/index.html`.

- `index.html:522-540` : vider les enfants statiques de `#resourcePanel`
  (garder la section `:521` avec `class="resource-panel hidden"`) — prouvé :
  l'unique `remove("hidden")` (`app.js:1544`) est APRÈS l'`innerHTML` qui
  écrase tout ; aucun `getElementById` boot-time sur ces ids.
- `styles.css`, par sélecteur, ordre décroissant (plages du rapport,
  décalées par D2) : ligne `.resource-search-input` du bloc 16 px (≈`:5790`)
  → `.dash-trend-guide/-dot` → `.dash-tip*` → `.d2-cta-kbd` → `@media` mort
  (`:4020-4025`) → `.setup-missing-actions`+disclosures → `.setup-missing-*`/
  `.setup-copy-btn` → `.setup-findings-summary`/`.setup-graph*`/
  `.setup-coverage-*` → `.setup-log-*`/`.setup-preview-*` (+ keyframes) →
  `.setup-progress-log` + `.setup-scanning`/`.setup-spinner`/`@keyframes
  setup-spin` **en épargnant `.setup-narration` (`:3216-3220`, vivant —
  `setup.html:145`)** → `.setup-stepper`/`.setup-step*` →
  `.resource-card-v2*` (`:839-1036`) → `.resource-search-*` (`:802-837`) →
  `.resource-panel-header/-icon/-subtitle` (`:770-800`) → `.resource-panel
  .resource-list` (`:764-768`) → `.resource-list`/`.resource-card` legacy
  (`:722-754`) → ligne `.resource-card,` de l'énumération transitions
  (`:120`). Total ≈ **819 lignes**.
- **Préserver** : `.prompt-action-*` (`:3773-3843`, vivant — coupe le bloc
  missing en deux), `.resource-panel` (`:757-762`), `.resource-empty-search`
  (`:1039-1048`), `.setup-error*`, `.setup-mapping-*`, `.setup-input`,
  `.setup-panel*`, `.setup-footer`, `.kr-confirm-cancel/-ok` (servitude D2a).
- Reste pour une passe future (mort non compté, ~100 l.) :
  `.setup-container`, `.setup-resource-*`, `.setup-pill*`, `.setup-gap*`,
  `.setup-cell-*`, `.setup-confidence*`, `.setup-origin*`.

**Vérif** : lint ; grep de chaque famille supprimée dans
`public/*.{js,html}` + docs = 0 ; `npm run test:mobile` (FONT/OVERFLOW sur
/setup et /services prouvent que rien de vivant n'est parti — la règle 16 px
restante `.d2-search input` couvre le champ hub sans classe) ; diff visuel
manuel des 4 routes dans les 2 thèmes (aucun changement visuel = le critère) ;
`wc -l public/styles.css` avant/après (~−820) ; `npm test`.

## Watchlist régressions

- **D1** : double init du menu (bind boot dashboard vs rebind hub — sélecteurs
  scopés) ; re-render du hub menu ouvert (popstate `app.js:4137-4144`) →
  close() défensif ; hit-area `::after` de l'avatar vs theme-toggle voisin
  (gap 14 px) ; menu `right:0` ≤ viewport (assertion smoke) ; Docs passe à
  2 clics (assumé).
- **D2a** : un seul `resolve` (dans le listener `close`) ; focus restitué à
  une ancre déjà retirée (cfg-menu fermé) → retombe sur body, identique à
  aujourd'hui ; unlock après « Got it » et après Escape.
- **D2b** : dérive du compteur scrollLock (tester ⌘K-sur-drill, fermetures
  dans les 2 ordres) ; commande de palette qui re-scrolle après fermeture
  (ordre unlock-puis-run) ; **tiroir fermé visible** si le piège `[open]` est
  raté (symptôme : overflow smoke) ; drag-select finissant sur le backdrop →
  fermeture (comportement scrim conservé) ; `backdrop-filter` sur
  `::backdrop` Safari iOS (dégradation acceptable).
- **D3** : familles pièges vivantes (prompt-action dans wizard + readiness ;
  setup-narration ; resource-empty-search) ; états d'erreur `.setup-error*` ;
  routes d'erreur de la navbar legacy (resource-pill intacte par décision).
- **Transverse** : CI (`tests.yml`, job mobile-smoke) verte à CHAQUE commit.

## Vérification globale (fin de série)

1. `npm test` + `npm run lint` + `npm run test:mobile` verts.
2. Parcours mock desktop + 390 px : login → hub → menu avatar → Docs/retour →
   dashboard → drill + palette + confirm + popover (empilements) → setup →
   logout depuis setup.
3. Clavier seul : Tab piégé dans chaque modale, focus restitué, Esc ne ferme
   que la modale du dessus, `aria-expanded` cohérents.
4. Mettre à jour `docs/backlog/mobile-ux-fix-plan.md` (statut hors-périmètre
   traité) ; committer ce plan en `docs/backlog/nav-dialog-cleanup-plan.md`.
