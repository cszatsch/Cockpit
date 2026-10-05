# Partager Cockpit : spécification

Console › Plateforme › **Partager Cockpit**. Accès : profil Administrateur uniquement (403 sinon, entrée de menu masquée).

Objectif : produire un ZIP d'installation Windows de Cockpit pour une personne précise, en maîtrisant les secrets qu'il contient.

## 1. Contenu du paquet

| Élément | Valeurs | Règles |
|---|---|---|
| Données | `current` (base actuelle), `demo` (jeu de démonstration), `empty` (Cockpit vide) | Pour `current`, au moins un projet doit être choisi. L'export ne contient que les projets sélectionnés et les référentiels communs. |
| Clés d'IA | Une case par fournisseur configuré | Chaque ligne affiche le masque de la clé et le plafond mensuel (`null` = sans plafond, affiché en rouge). |
| Serveur SMTP | inclus / exclu | S'il est exclu, la configuration SMTP est vide à l'installation. |
| Fichiers déposés | inclus / exclu | Base de connaissance, guide utilisateur, formats de rapport. Taille et nombre de fichiers pour chaque catégorie. |

**Taille estimée** = application + données + fichiers, recalculée à chaque changement (bandeau, barre en trois segments).
**Dépense IA possible** = somme des plafonds des clés incluses. Elle vaut « Illimitée » si au moins une clé n'a pas de plafond, et 0 € si aucune clé n'est incluse.
**Secrets** = nombre de clés d'IA incluses, plus 1 si le SMTP est inclus.

## 2. Sécurité

- **Avertissement** construit à partir du contenu : utilisation des comptes d'IA (facturés chez l'administrateur) et envoi d'e-mails depuis l'adresse SMTP.
- **Code de déverrouillage**, activé par défaut :
  - Le code fait 12 caractères en 3 groupes (`XXXX-XXXX-XXXX`). L'alphabet exclut les caractères ambigus (0/O, 1/I/L). Il est généré côté serveur avec un générateur aléatoire cryptographique.
  - Une clé est dérivée du code (Argon2id, sel aléatoire, stocké dans le paquet). Les secrets sont chiffrés en AES-256-GCM avec cette clé.
  - Le code est renvoyé **une seule fois**, dans la réponse de fin de génération. Il n'est jamais stocké, ni en clair ni sous forme de hash réversible. L'écran le masque après « Code noté, le masquer » ou au rechargement.
  - L'installateur demande le code. Sans code valide, l'installation se poursuit sans clés et sans SMTP.
  - Sans code, les secrets sont chiffrés avec une clé incluse dans le paquet, donc lisibles par quiconque obtient le ZIP. L'écran l'indique comme « Exposé ».
- Les secrets sont **rechiffrés** pour le paquet. Le chiffrement serveur d'origine n'est jamais exporté.
- Un lien renvoie vers Fournisseurs et modèles (clés dédiées et plafonnées).
- **Journal d'audit** : chaque génération est inscrite comme action sensible (auteur, destinataire, contenu, version, empreinte). Il en va de même pour chaque suppression de fichier.

## 3. Destinataire

- Nom (obligatoire) et e-mail (obligatoire, format valide). Ces informations servent uniquement à l'historique : aucun e-mail n'est envoyé.
- **Préremplir son compte** : nom, e-mail et profils sélectionnés. L'installateur ne demande alors que le mot de passe. Sinon, il propose de créer un compte administrateur.

## 4. Génération

Le bouton « Générer le paquet » est actif si le destinataire est valide et si, en mode `current`, au moins un projet est choisi.
La génération est une tâche asynchrone en 4 étapes, diffusée en temps réel (SSE ou WebSocket), sur le même modèle que la mise en service des templates :

1. `compile` : build de l'application win-x64
2. `copy_db` : export de la base selon le mode choisi
3. `encrypt` : rechiffrement des secrets (étape ignorée s'il n'y a aucun secret)
4. `archive` : création du ZIP

La tâche se poursuit si l'utilisateur quitte l'écran. Au retour, l'état est restauré.
En fin de tâche, le serveur renvoie : la taille réelle, le SHA-256 du ZIP, le nom du fichier (`cockpit-<version>-<initiale><nom>.zip`) et le code s'il est activé.

## 5. Téléchargement et envoi

- « Télécharger le ZIP » : URL signée à durée courte (15 min), réservée à l'Administrateur.
- « Message pour <prénom> » : texte prêt à copier, généré côté client à partir des choix. Il contient les étapes d'installation, le SHA-256, la mention du code transmis par SMS (si le code est activé), la configuration requise (Windows 10 ou 11 64 bits, environ 1 Go libre, port 3000 disponible), les adresses (`http://localhost:3000` et `/console`) et une consigne de confidentialité.

## 6. Historique

Une ligne par paquet, la plus récente en haut : date et heure, auteur, destinataire, contenu (données, nombre de secrets, protection par code), version, taille et empreinte (tronquée, complète au survol).
- **Supprimer le fichier** efface le ZIP du serveur. La ligne reste, avec la mention « Fichier supprimé le … ».
- **Clés à révoquer** : pour chaque paquet, la liste des clés incluses (masques) et le mot de passe SMTP s'il était inclus.
- Rappel permanent : une installation déjà faite ne peut pas être désactivée à distance. La seule parade est de révoquer les clés chez les fournisseurs.

## 7. Version

Numéro et build de l'application, et nouveautés depuis la version du dernier paquet généré.
Comportement à la mise à jour chez le destinataire :
- `keep` : seule l'application est mise à jour, les données sont conservées.
- `replace` : la base est remplacée par celle du paquet, après une sauvegarde locale.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/admin/share/context` | Version, nouveautés, projets (taille, méta), fournisseurs (masque, plafond), SMTP (hôte, expéditeur), fichiers (catégories, nombres, tailles), profils |
| POST | `/api/admin/share/packages` | Lance la génération. Corps : `{ data, projects[], keys[], smtp, files, code, recipient:{name,email}, prefill:{enabled,profiles[]}, update }`. Réponse : `{ jobId }` |
| GET | `/api/admin/share/packages/:jobId/events` | Flux d'étapes `{ step, status }`, puis `{ done, size, sha256, fileName, code? }` |
| GET | `/api/admin/share/packages` | Historique |
| GET | `/api/admin/share/packages/:id/download` | URL signée |
| DELETE | `/api/admin/share/packages/:id/file` | Suppression du fichier (et inscription au journal d'audit) |

Le champ `code` n'est présent que dans l'événement final. Il ne doit jamais figurer dans les logs.

## Recette

1. Démonstration, 2 clés plafonnées, SMTP, code activé : dépense IA = somme des plafonds, statut « Protégé », code affiché une seule fois, puis masqué après confirmation.
2. Une clé sans plafond est cochée : dépense « Illimitée » et pied de tuile en rouge.
3. Code désactivé avec des secrets inclus : statut « Exposé », point rouge dans le bandeau, ligne « sans code » dans l'historique.
4. Base actuelle sans projet sélectionné : bouton de génération désactivé, avec message.
5. E-mail du destinataire invalide : bouton désactivé, erreur affichée dans le pied de la tuile.
6. Rechargement pendant la génération : la progression reprend à l'étape en cours.
7. Suppression du fichier : la ligne est conservée, le téléchargement renvoie 410 et l'action est inscrite au journal d'audit.
8. Un utilisateur non administrateur reçoit 403 sur toutes les routes.
