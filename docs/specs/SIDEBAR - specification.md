# RISE · Console : nouvelle sidebar (variantes 1a + 2b)

Remplace la sidebar de `Console Admin.dc.html`. Composant autonome : `Sidebar Console.dc.html` (double-clic pour le voir seul).

## 1. Ce qui change
- 13 pages, dont **Persona** et **Skills** (nouvelles), regroupées en 5 domaines repliables + Vue d’ensemble.
- **Accordéon** : un seul domaine déplié à la fois. Par défaut, le domaine de la page active est déplié ; un changement de page réinitialise ce choix.
- **Domaine replié** : il remonte les signaux de ses pages (compteur ambre prioritaire, sinon point rouge `err` ou ambre `warn`) ; s’il contient la page active, un repère ambre s’affiche sur sa gauche.
- **Ouvrir le Cockpit** : quitte le bas de la sidebar. Icône ↗ dans l’en-tête, à côté du bouton de repli ; infobulle « Ouvrir le Cockpit ⇧⌘C » au survol et au focus ; raccourci global **⇧⌘C** (Ctrl+Maj+C sous Windows).
- En mode réduit (`rail`, 72 px) : une icône par domaine avec ses signaux ; un clic ouvre un menu flottant listant les pages du domaine (fermeture : Échap, clic extérieur, choix d’une page). L’icône Cockpit passe au-dessus de Jev.

- **En-tête** : badge CONSOLE suivi de « d’administration ». La barre de recherche est retirée de la sidebar : ⌘K reste disponible au clavier (géré par la console). Le raccourci ⌘J n’est plus affiché sur le bouton Jev (il reste actif).

## 2. Arborescence

| Domaine | id page (`S.sec`) | Libellé |
|---|---|---|
| — | `overview` | Vue d’ensemble |
| Accès | `users`, `admins` | Utilisateurs, Administrateurs |
| IA | `providers`, `assign`, `conso` | Fournisseurs et modèles, Affectation des modèles, Consommation et coûts |
| Assistant | `persona`, `skills` | Persona, Skills (**nouveaux**) |
| Projets | `library`, `init`, `snaps` | Bibliothèque des projets, Initialisation d’un projet, Snapshots |
| Plateforme | `modules`, `notifs` | Modules, Notifications et alertes |

La constante `DOMS` du composant est la source de vérité ; elle remplace `NAV` dans la console. Mettre à jour `META` (fil d’Ariane, titre) : l’ancien groupe devient le nom du domaine, et ajouter :
```js
persona: ['Assistant', 'Persona', 'Ton, style et règles de comportement de Jev.'],
skills:  ['Assistant', 'Skills', 'Les capacités de Jev : activation, périmètre et version.'],
```
Les pages Persona et Skills restent à concevoir (placeholder « Bientôt disponible » en attendant).

## 3. Intégration dans `Console Admin.dc.html`
1. Copier `Sidebar Console.dc.html` à côté de la console.
2. Remplacer tout le bloc `<aside …>…</aside>` (navigation, Ouvrir le Cockpit, Jev, profil) par :
```html
<dc-import name="Sidebar Console" mode="{{ sbMode }}" active="{{ sec }}" signals="{{ sbSignals }}"
  user="{{ sbUser }}" jev-on="{{ jvOn }}" cockpit-url="./RISE Cockpit.dc.html"
  on-navigate="{{ sbGo }}" on-open-palette="{{ openPal }}" on-toggle-jev="{{ toggleJev }}"
  on-open-profile="{{ goProfil }}" on-toggle-collapse="{{ toggleRail }}" on-close="{{ closeNav }}"
  hint-size="252px,100vh"></dc-import>
```
3. Dans `renderVals()` :
```js
sbMode: mode === 'rail' ? 'rail' : mode === 'mob' ? 'mob' : 'full',
sec: S.sec,
sbGo: id => this.go(id),
sbUser: { name: meName, role: 'Administrateur', photo: S.photo },
sbSignals: {
  users: badge.users ? { b: badge.users[1] } : undefined,
  providers: S.provs.some(p => p.st === 'err') ? { dot: 'err' } : undefined,
  assign: /* une fonction IA à l’arrêt */ anyDown ? { dot: 'err' } : anyFallback ? { dot: 'warn' } : undefined
}
```
`badge` est l’objet déjà calculé pour les pastilles actuelles. Tout signal non listé est ignoré.
4. Supprimer `NAV`, la construction `nav` et les styles `asideSt`, `jevBtnSt`, `meSt`, `meAv`, `srchPad` devenus inutiles. Garder `shellSt` (colonnes 252 / 72 / 0 px inchangées).
5. Raccourcis : ⌘K et ⌘J restent gérés par la console ; ⇧⌘C est géré par le composant (appelle `onOpenCockpit` s’il est fourni, sinon ouvre `cockpitUrl` dans un nouvel onglet).
6. Mobile (`mob`) : la sidebar garde son rendu complet ; le bouton de repli est remplacé par une croix qui appelle `onClose`.

## 4. Props

| Prop | Type | Rôle |
|---|---|---|
| `mode` | `'full' \| 'rail' \| 'mob'` | largeur 252 px, 72 px, ou tiroir mobile |
| `active` | `string` | id de la page ouverte (`S.sec`) |
| `signals` | `Record<id, { b?: number; dot?: 'err' \| 'warn' }>` | compteurs et états par page |
| `user` | `{ name, role?, ini?, photo? }` | carte profil |
| `jevOn` | `boolean` | état du panneau Jev |
| `cockpitUrl` | `string` | cible par défaut du lien Cockpit |
| `onNavigate(id)`, `onOpenCockpit()`, `onOpenPalette()`, `onToggleJev()`, `onOpenProfile()`, `onToggleCollapse()`, `onClose()` | callbacks | |

## 5. Accessibilité
- `aria-current="page"` sur la page active ; `aria-expanded` + `aria-controls` sur chaque domaine ; pages d’un domaine replié retirées de la tabulation (`tabIndex=-1`).
- Libellé accessible des domaines enrichi par le signal (« Accès, 2 en attente », « IA, incident »).
- Infobulle Cockpit reliée par `aria-describedby`, visible au focus clavier.
- Animations (déplié / replié 320 ms) désactivées si `prefers-reduced-motion`.

## 6. Détails visuels (à ne pas modifier)
- Fond `linear-gradient(180deg,#0f2034,#0a1727)` ; repère actif ambre `#f7a41c` 3 px ; icône de domaine déplié `#3dd6c6`.
- Pages : 34 px de haut, retrait 36 px, filet vertical `rgba(255,255,255,.1)` à 18 px.
- Pastille compteur : `#f7a41c` sur `#1a1200`, 18 px ; points d’état 7 px avec halo 3 px.
