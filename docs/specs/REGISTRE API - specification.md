# Registre des cartes API · spécification (version 3c)

Route : `/plateforme/cartes-api`. Libellé sidebar : « Registre des cartes API » (domaine Plateforme).

## 1. Structure
Deux colonnes de même hauteur (bords haut et bas alignés) :
- **Gauche**
  1. **État du registre** : une ligne par tag, une pastille de 36 px par carte (initiales). Couleur = état. Hachures = carte qui n'alimente aucun widget. Clic sur une ligne = affiche ce tag ; clic sur une pastille = sélectionne la carte.
  2. **Légende filtrante** : Opérationnelle, Lente, À surveiller, En erreur, Désactivée, Sans widget, avec compteurs. Clic = atténue les autres pastilles (opacité 0,22). Nouveau clic = retire le filtre.
  3. **Table du tag sélectionné** : Carte, Endpoint, Latence 24 h, Quota, Clé, Alimente. Toutes les colonnes sont triables. Ligne « Ajouter une carte à <tag> » en bas.
- **Droite** : panneau de détail. Il occupe toute la hauteur, avec le pied de page ancré en bas.

## 2. États d'une carte (ordre de priorité)
| État | Règle | Couleur |
|---|---|---|
| Désactivée | `off = true` | gris `#b3c1c8` |
| Non vérifiée | aucune réponse (`resp = null`) | contour gris |
| En erreur | dernier code HTTP ≥ 400 | rouge plein `#c2473b` |
| À surveiller | clé expirant sous 60 j **ou** quota ≥ 80 % | `#e0604c` |
| Lente | latence médiane ≥ 300 ms | ambre `#d99a2b` |
| Opérationnelle | sinon | sarcelle `#1d8f86` |

## 3. Tri
Un clic trie, un deuxième inverse le sens, un troisième retire le tri. Latence, Quota et Alimente trient d'abord par ordre décroissant, les autres colonnes par ordre croissant. Les valeurs vides (« — », « Sans clé », carte en erreur) sont toujours placées en fin de liste.

## 4. Panneau de détail
- **Vue** : tag, pastille d'état, nom, **Modifier**. Notes d'alerte contextuelles (401 → « La clé API est refusée… », 503, clé bientôt expirée, quota, lenteur, désactivée). Endpoint (copier), Clé API (barrée si 401, date d'expiration en rouge sous 60 j), **Tester l'appel**, console de réponse (code, durée, date, corps JSON ou XML coloré).
- **Alimente** : widgets associés (× pour dissocier) et « Associer un widget ». La liste s'ouvre **en surimpression au-dessus du bouton** : le panneau ne s'allonge pas. Elle comprend une recherche, puis « Suggérés pour <tag> » et « Autres widgets » (catalogue des 22 widgets). Elle se ferme au clic extérieur ou avec Échap.
- **Pied** : Désactiver / Réactiver, **Supprimer la carte**. La suppression se confirme dans un encart qui liste les widgets impactés. Un toast propose ensuite « Annuler » pendant 5 s.
- **Modifier / Nouvelle carte** : nom, tag (existant ou nouveau, créé à la volée), endpoint (préfixe `https://`, validé), clé (Sans clé / Clé requise, champ masqué avec bouton afficher, expiration `jj/mm/aa` facultative). Changer l'endpoint efface la latence et la dernière réponse. Une nouvelle clé sur une carte en 401 permet au test suivant de réussir.

## 5. Modèle de données
```ts
Card = {
  id: string; n: string; tag: string; ep: string;      // ep sans https://
  lat: number | null; q: number | null;                // latence médiane 24 h, quota jour %
  hasKey: boolean; key: string | null;                 // expiration jj/mm/aa
  w: string[];                                         // ids de widgets (catalogue WIDGETS)
  fmt: 'json' | 'xml';
  resp: { code: number; txt: string; ms: number; when: string; body?: string[] } | null;
  off: boolean;
}
```

## 6. API proposée
| Action | Route |
|---|---|
| Liste | `GET /api-cards` |
| Créer | `POST /api-cards` |
| Modifier | `PATCH /api-cards/:id` (la clé n'est envoyée que si elle a été saisie) |
| Supprimer | `DELETE /api-cards/:id` |
| Activer / désactiver | `PATCH /api-cards/:id { off }` |
| Tester | `POST /api-cards/:id/test` → `resp` |
| Associer / dissocier | `PUT /api-cards/:id/widgets { ids: string[] }` |

La clé API n'est jamais renvoyée au frontend, seulement ses 4 derniers caractères.

## 7. Recette
1. Cliquer sur la légende « En erreur » : seules Vigicrues et Pappers restent nettes.
2. Trier la table Actualités par latence : GNews et NewsData.io en tête, puis décroissant.
3. Pappers : Modifier → coller une clé → Enregistrer → Tester : 200 OK, la pastille passe au vert.
4. Ouvrir « Associer un widget » : le panneau garde sa hauteur. Un clic à l'extérieur ferme la liste.
5. Supprimer une carte liée à un widget : l'encart cite le widget. « Annuler » dans le toast restaure la carte.
6. Nouvelle carte avec un tag créé à la volée : une nouvelle ligne apparaît dans l'état du registre, avec une pastille « Non vérifiée ».
7. Désactiver une carte : pastille grise, bouton de test inactif, « Réactiver » disponible.
