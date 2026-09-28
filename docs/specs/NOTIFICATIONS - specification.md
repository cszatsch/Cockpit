# RISE · Console : notifications de l’administrateur (variante 5d)

Deux fichiers : `Sidebar Console.dc.html` (version mise à jour, avec la cloche) et `Notifications.dc.html` (le tiroir).

## 1. Principe
L’administrateur reçoit dans un tiroir unique :
- **Incidents** (`err`) : clé API refusée ou désactivée, erreur d’import, échec d’un snapshot, toute erreur technique ;
- **Alertes** (`warn`) : seuil de coût IA, quota proche ;
- **Demandes d’invitation** (`invite`) : un utilisateur demande l’ajout d’une personne ;
- **Demandes d’activation de module** (`module`) : un utilisateur demande un module pour un projet.

## 2. Cloche (sidebar)
- Placée à droite de « CONSOLE d’administration » (mode complet) ; au-dessus de l’icône Cockpit (mode réduit).
- Compteur = notifications **non lues et non traitées**. Fond **corail** s’il existe au moins un incident non lu, sinon **ambre**. Masqué à 0 ; « 99+ » au-delà.
- Libellé accessible : « Notifications, 4 non lues, dont un incident ».
- Nouveaux props de la sidebar : `notifCount`, `notifHasError`, `notifOpen`, `onToggleNotifications`.

## 3. Tiroir
- S’ouvre le long de la sidebar (`left` = 252 px, ou 72 px en mode réduit), 440 px de large, voile sur le reste de la page. Fermeture : croix, clic sur le voile, Échap, ou nouveau clic sur la cloche.
- En-tête : « Notifications », « N non lues », **Tout lire**, fermer.
- Filtres : **Tout**, **Demandes**, **Incidents** (avec compteurs).
- Deux groupes : « Incidents et alertes » puis « Demandes à traiter », du plus récent au plus ancien.
- Chaque notification : pictogramme par type, titre (gras si non lue), date relative, texte, message du demandeur en italique s’il existe, point de non-lecture (corail pour un incident).
- Actions :
  - `invite` : **Refuser** / **Inviter** ;
  - `module` : **Refuser** / **Activer** ;
  - `err` : bouton principal (ex. « Remplacer la clé ») qui ouvre l’écran concerné ;
  - `warn` : « Voir le détail » (ex. « Voir les coûts »).
- Après Inviter / Activer / Refuser : la ligne devient une confirmation verte (« Invitation envoyée à Léa Martin ») avec **Annuler**. L’annulation reste possible pendant 10 s côté serveur (l’e-mail d’invitation part après ce délai).
- Liste vide : « Tout est traité ».

## 4. Props / callbacks du tiroir
| Prop | Type | Rôle |
|---|---|---|
| `open` | `boolean` | affichage |
| `left` | `number` | largeur de la sidebar (252 ou 72) |
| `items` | voir ci-dessous | notifications du serveur (démo intégrée sinon) |
| `onClose()` | | fermeture |
| `onAction(id, action)` | `accept \| refuse \| fix \| open` | décision ou navigation |
| `onUndo(id)` | | annulation d’une décision |
| `onReadAll()` | | tout marquer comme lu |

`Notification { id, type: 'err'|'warn'|'invite'|'module', title, text, note?, when (texte relatif), unread, actLabel? (libellé du bouton pour err / warn), meta? { name, by, project } (pour les messages de confirmation), target? (page à ouvrir pour fix / open) }`

## 5. API attendue
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/admin/notifications` | liste + `unreadCount`, `hasError` |
| POST | `/api/admin/notifications/:id/read` | marquer comme lue |
| POST | `/api/admin/notifications/read-all` | tout marquer comme lu |
| POST | `/api/admin/notifications/:id/decision` | `{ decision: 'accept' \| 'refuse' }` |
| POST | `/api/admin/notifications/:id/undo` | annulation (10 s) |

- `accept` d’une invitation : crée l’invitation (même traitement que la page Utilisateurs) ; `accept` d’un module : active le module pour le projet (même traitement que la page Modules). Le demandeur est prévenu dans les deux cas, y compris en cas de refus.
- Les incidents sont créés automatiquement (test de clé en échec, erreur d’import…) et se **ferment seuls** quand la cause disparaît (clé remplacée et testée).
- Rafraîchissement : à l’ouverture du tiroir et toutes les 60 s (ou par événement serveur si disponible).
- Chaque décision est tracée dans le journal d’audit.

## 6. Intégration dans `Console Admin.dc.html`
1. Remplacer `Sidebar Console.dc.html` par la version de ce dossier et lui passer :
```html
notif-count="{{ ntUnread }}" notif-has-error="{{ ntHasErr }}" notif-open="{{ ntOpen }}" on-toggle-notifications="{{ ntToggle }}"
```
2. Ajouter le tiroir à la fin du shell :
```html
<dc-import name="Notifications" open="{{ ntOpen }}" left="{{ ntLeft }}" items="{{ ntItems }}"
  on-close="{{ ntClose }}" on-action="{{ ntAct }}" on-undo="{{ ntUndo }}" on-read-all="{{ ntReadAll }}" hint-size="0,0"></dc-import>
```
avec `ntLeft = mode === 'rail' ? 72 : 252` (en mobile, `0` et largeur plein écran).
3. `onAction(id, 'fix' | 'open')` : fermer le tiroir et naviguer vers `target` (ex. `providers` pour une clé, `conso` pour le budget).
4. Le compteur « 2 » de la sidebar sur **Accès** reste le nombre d’invitations en attente ; il doit baisser dès qu’une invitation est acceptée ou refusée.
5. La page « Notifications et alertes » du domaine Plateforme règle les notifications envoyées aux **utilisateurs** ; elle ne change pas. Pour éviter la confusion, la renommer « Alertes utilisateurs » (à valider).
