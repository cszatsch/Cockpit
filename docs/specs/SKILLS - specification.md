# RISE · Console : page Skills (variante 3a)

Page `skills` du domaine **Assistant** de la Console (sidebar : Assistant › Skills). Composant autonome : `Skills.dc.html`.

## 1. Principe
Une skill est un **texte ajouté au prompt système de Jev**. Elle a :
- un **nom** (60 caractères max) ;
- un **texte** libre, écrit en Markdown simple (`## titre`, `- puce`, `1. étape`, paragraphes) ;
- un état **active / désactivée**.

Toutes les skills actives sont concaténées au prompt de Jev, dans l’ordre de la liste, pour toutes les réponses. Une skill désactivée n’est pas envoyée.

## 2. Écran
- **En-tête** : ASSISTANT / Skills / « Des consignes ajoutées au prompt de Jev. Une skill active s’applique à toutes ses réponses. » + bouton **Nouvelle skill**.
- **Liste** (gauche, 320 px max) : compteur « N skills · N actives » ; une ligne par skill avec nom, état, nombre de caractères, interrupteur. Ligne sélectionnée : fond `#eef4f2`, sans bordure. Point ambre si la skill a des modifications non enregistrées.
- **Éditeur** (droite) :
  - nom modifiable en place (22 px, 800) ; interrupteur Active / Désactivée ;
  - onglets **Modifier** (zone de texte, police JetBrains Mono) / **Aperçu** (rendu du Markdown) ;
  - compteur « N caractères · ≈ N tokens » (tokens ≈ caractères / 4) ;
  - pied : **Supprimer** (en deux temps : « Confirmer la suppression » / « Garder »), mention « Modifications non enregistrées », **Annuler**, **Enregistrer** (désactivés tant que rien n’a changé).

## 3. Comportements
- Les modifications du nom et du texte restent en **brouillon** jusqu’à Enregistrer. Un brouillon est conservé par skill quand on change de sélection.
- L’interrupteur prend effet **immédiatement** (appel `onToggle`), sans passer par Enregistrer.
- **Nouvelle skill** crée « Nouvelle skill », désactivée, texte vide, et l’ouvre en mode Modifier. Elle ne rejoint le prompt qu’une fois activée.
- Nom vide à l’enregistrement : remplacé par « Sans nom » (ou refuser côté serveur, `422`).
- Aucune skill : message « Aucune skill. Créez-en une. »

## 4. Props / callbacks
| Prop | Type | Rôle |
|---|---|---|
| `skills` | `{ id, n, t, on }[]` | liste venant du serveur (démo intégrée sinon) |
| `onSave(skill)` | | nom et texte enregistrés |
| `onToggle(id, on)` | | activation / désactivation |
| `onCreate(skill)` | | nouvelle skill (id provisoire `new-…`, à remplacer par l’id serveur) |
| `onDelete(id)` | | suppression confirmée |

## 5. API attendue
| Méthode | Route | Corps |
|---|---|---|
| GET | `/api/assistant/skills` | → `Skill[]` triées par `position` |
| POST | `/api/assistant/skills` | `{ n, t, on:false }` → `Skill` |
| PATCH | `/api/assistant/skills/:id` | `{ n?, t?, on? }` → `Skill` |
| DELETE | `/api/assistant/skills/:id` | |

Modèle : `Skill { id, n (≤ 60), t (texte, ≤ 20 000 car.), on (bool), position (int), updated_at, updated_by }`. Chaque modification est tracée dans le journal d’audit de la console (« Skill modifiée / activée / désactivée / supprimée »).

## 6. Assemblage du prompt (backend)
```
<prompt système de Jev>
<Persona>
## Skill : {n}
{t}
… (une section par skill active, ordre de position)
```
Les skills désactivées sont ignorées. Le texte est injecté tel quel (pas de rendu Markdown).

## 7. Intégration dans `Console Admin.dc.html`
1. Copier `Skills.dc.html` à côté de la console.
2. Dans la zone de contenu, pour `S.sec === 'skills'`, afficher :
```html
<dc-import name="Skills" skills="{{ skills }}" on-save="{{ skSave }}" on-toggle="{{ skToggle }}"
  on-create="{{ skCreate }}" on-delete="{{ skDelete }}" hint-size="100%,720px"></dc-import>
```
3. Le composant contient son propre en-tête (ASSISTANT / Skills) : masquer l’en-tête générique de la console pour cette page, ou retirer celui du composant, pour ne pas le dupliquer.
4. `META.skills = ['Assistant', 'Skills', 'Des consignes ajoutées au prompt de Jev.']`.
5. La sidebar à utiliser est celle de `Sidebar Console.dc.html` (voir `SIDEBAR - specification.md`), qui contient déjà l’entrée Assistant › Skills.
