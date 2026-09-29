# Notifications et alertes · spécification (proposition 1a)

Route : `/plateforme/notifications`. Libellé sidebar : « Notifications et alertes » (domaine Plateforme).

## 1. Structure
1. En-tête : PLATEFORME / Notifications et alertes / phrase d'introduction.
2. Colonne gauche (340 px, sticky) : règles groupées ALERTES puis NOTIFICATIONS. Ligne sélectionnée sur fond marine `#10233a`. Règle inactive : opacité 0,62, fréquence préfixée « Inactive · » en ambre `#8a5a12`. Interrupteur à droite, indépendant de la sélection.
3. Éditeur (carte blanche) :
   - Titre éditable, badge « Inactive » si besoin, bouton Désactiver / Activer.
   - **Phrase de synthèse** générée depuis le brouillon : événement, verbe (alerter / informer), profils, projets, fréquence, canal, modèle. Valeurs soulignées sarcelle ; valeurs manquantes en rouge pointillé.
   - Bandeau d'erreurs bloquantes (voir § 3).
   - Lignes réglages (libellé 220 px | contrôle) : Type, Canal, Destinataires par profil, Projets ciblés, Fournisseur et modèle, Prompt envoyé au modèle, Fréquence d'envoi.
   - Message (objet + corps) et Aperçu (Application / E-mail) côte à côte.
   - Pied : M'envoyer un test, Supprimer la règle, état d'enregistrement.
4. Historique des envois (pleine largeur) : Cette règle / Toutes les règles.

## 2. Modèle de données
```ts
Rule = {
  id: string; type: 'alerte' | 'notification'; title: string;
  evt: string;               // fragment de phrase : « un jalon est en retard »
  profils: string[];         // 'Admin' | 'PMO' | 'Responsable' | 'Lecteur'
  projets: string[];         // ['*'] = tous
  canaux: ('app' | 'mail')[]; // au moins un
  freq: 'imm' | 'day' | 'week' | 'custom'; at: string; // « lundi 08:00 », « 18:00 »
  on: boolean; model: string | null;
  prompt: string; subject: string; body: string;
}
Model   = { id, provider, name }
History = { rid, w, c, d, ok }     // w : « il y a 3 j », c : canal, d : « 4 destinataires »
counts  = { [profil]: nombre de destinataires actifs }
```

## 3. Règles
- Erreurs bloquantes : `model === null` → « Aucun modèle choisi (modèles réinitialisés) : la règle ne pourra pas s'envoyer. » ; `profils` vide → « Aucun destinataire : la règle ne pourra pas s'envoyer. ». Avec une erreur, « M'envoyer un test » est désactivé.
- « Tous » dans Projets ciblés exclut les projets individuels, et inversement.
- Le dernier canal actif ne peut pas être retiré.
- Variables cliquables : insertion à la fin du corps du message. `{reponse_llm}` est interdit dans le prompt (rappel affiché).
- Aperçu : variables remplacées par un échantillon (J06 · Go / No-Go Go-Live, RISE, 29 sept. 2026). Barre et badge rouges pour une alerte, sarcelle pour une notification.
- Brouillon : toute modification affiche « Modifications non enregistrées » + Annuler / Enregistrer. Changer de règle avec un brouillon demande confirmation.
- Suppression en deux clics (« Confirmer la suppression »).
- L'interrupteur de la liste et le bouton Désactiver agissent immédiatement (hors brouillon).

## 4. Props / API
| Prop | Rôle |
|---|---|
| `rules`, `models`, `projects`, `counts`, `history` | données (démo si absent) |
| `onSave(rule)` | `PUT /notifications/rules/:id` |
| `onToggle(id, on)` | `PATCH /notifications/rules/:id { on }` |
| `onCreate(rule)` | `POST /notifications/rules` |
| `onDelete(id)` | `DELETE /notifications/rules/:id` |
| `onTest(rule)` | `POST /notifications/rules/:id/test` |

Historique : `GET /notifications/history?rule=:id` (ou sans filtre pour « Toutes les règles »).

## 5. Recette
1. Sélectionner « Jalon en retard » : phrase se termine par « aucun modèle » en rouge, bandeau d'erreur visible, test désactivé.
2. Choisir un modèle : bandeau disparaît, phrase affiche le nom du modèle, test actif, « Modifications non enregistrées ».
3. Retirer PMO et Responsable : « Aucun destinataire » en rouge dans la ligne et dans la phrase.
4. Cliquer « Tous » puis « RISE » : Tous se désélectionne.
5. Passer l'aperçu sur E-mail : en-tête expéditeur + objet rempli.
6. Désactiver « Nouveau document analysé » / réactiver depuis la liste : état cohérent dans la liste et l'éditeur.
7. Historique « Toutes les règles » : lignes d'autres règles, dont un « Échec » rouge.
