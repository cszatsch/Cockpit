# RISE · Console : page Persona (variante 4a)

Page `persona` du domaine **Assistant** (sidebar : Assistant › Persona). Composant autonome : `Persona.dc.html`. Même principe visuel que la page Skills.

## 1. Principe
Le Persona définit Jev en deux parties :
- **Identity** (en surface) : ce que l’utilisateur voit. Nom, créature, style, emoji, avatar.
- **Soul** (en profondeur) : un texte libre qui décrit sa personnalité, sa façon d’écrire et ses convictions.

Il n’existe qu’**un seul Persona** pour la plateforme. Il est lu par Jev avant chaque réponse, **avant les skills**.

## 2. Écran
- **En-tête** : ASSISTANT / Persona / « Qui est Jev, et comment il pense. Lu avant chaque réponse, avant les skills. »
- **Liste** (gauche) : deux entrées, Identity et Soul, avec un résumé (ex. « 🧭 Jev · Copilote de projet » ; titres du Soul). Point ambre sur une entrée modifiée non enregistrée. Rappel de l’ordre de lecture sous la liste.
- **Identity** :
  - avatar 120 px ; 4 avatars prédéfinis (`nuit`, `ambre`, `lagon`, `encre`) ou **Importer une image** (PNG, JPEG, WebP, 1 Mo max) ;
  - **Nom** (obligatoire, 30 car.), **Créature** (40 car.), **Style** (60 car.) ;
  - **Emoji** : un choix parmi 🧭 ✨ 🦉 🛰️ 🐙 🌱.
- **Soul** : onglets **Modifier** (texte, JetBrains Mono) / **Aperçu** (rendu `##`, `-`, `1.`) ; compteur caractères et tokens (≈ caractères / 4), 20 000 caractères max.
- **Pied** : « Modifications non enregistrées », **Annuler**, **Enregistrer** (désactivé si rien n’a changé ou si le nom est vide).

## 3. Comportements
- Identity et Soul partagent **un seul enregistrement** : Enregistrer sauvegarde les deux, Annuler rétablit les deux.
- Changer d’onglet conserve les modifications en cours.
- Choisir un avatar prédéfini remplace une image importée.
- Le nom de Jev affiché dans toute l’application (sidebar, panneau Jev) vient d’`identity.name` ; l’avatar et l’emoji s’affichent dans le panneau Jev.

## 4. Props / callbacks
| Prop | Type | Rôle |
|---|---|---|
| `persona` | `{ identity: { name, creature, style, emoji, avatar, photo }, soul }` | données du serveur (démo intégrée sinon) |
| `onSave(persona)` | | Identity + Soul enregistrés |
| `onUploadAvatar(file)` | | envoi de l’image ; renvoyer l’URL stockée dans `identity.photo` |

## 5. API attendue
| Méthode | Route | Corps |
|---|---|---|
| GET | `/api/assistant/persona` | → `Persona` |
| PUT | `/api/assistant/persona` | `Persona` → `Persona` (valide les longueurs, `422` sinon) |
| POST | `/api/assistant/persona/avatar` | image multipart → `{ url }` |

Modèle : `Persona { identity { name ≤ 30 (requis), creature ≤ 40, style ≤ 60, emoji, avatar ∈ {nuit, ambre, lagon, encre}, photo: url | null }, soul ≤ 20 000, updated_at, updated_by }`. Chaque enregistrement est tracé dans le journal d’audit (« Persona modifié »). Conserver les versions précédentes pour pouvoir revenir en arrière.

## 6. Assemblage du prompt (backend)
```
<prompt système de Jev>
## Identité
Tu t’appelles {name}. Tu es {creature}. Ton style : {style}. Ton emoji : {emoji}.
## Personnalité
{soul}
## Skill : {n}
{t}
… (skills actives, voir SKILLS - specification.md)
```
Le Soul est injecté tel quel (pas de rendu Markdown). L’avatar n’est pas envoyé au modèle.

## 7. Intégration dans `Console Admin.dc.html`
1. Copier `Persona.dc.html` à côté de la console.
2. Pour `S.sec === 'persona'`, afficher :
```html
<dc-import name="Persona" persona="{{ persona }}" on-save="{{ psSave }}" on-upload-avatar="{{ psUpload }}" hint-size="100%,680px"></dc-import>
```
3. Le composant contient son propre en-tête : masquer l’en-tête générique de la console sur cette page (même règle que Skills).
4. `META.persona = ['Assistant', 'Persona', 'Qui est Jev, et comment il pense.']`.
5. Remplacer l’écran provisoire « Bientôt disponible » de Persona.
6. Passer `identity.name` à la sidebar (libellé du bouton Jev) et au panneau Jev.
