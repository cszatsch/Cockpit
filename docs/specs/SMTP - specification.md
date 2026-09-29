# Serveur d'envoi SMTP · spécification

Route : `/plateforme/smtp`. Libellé sidebar : « Serveur d'envoi SMTP » (domaine Plateforme). Utilisé par les règles de « Notifications et alertes » pour le canal E-mail.

## 1. Structure
- **En-tête** : PLATEFORME / Serveur d'envoi SMTP / pastille d'état (« Configuré · dernier test… », « Modifications non enregistrées », « Connexion en échec »).
- **Formulaire** (gauche), trois blocs numérotés :
  1. **Serveur** : Serveur SMTP (badge « Gmail détecté »), Chiffrement (TLS / STARTTLS · SSL/TLS · Aucun), Port (avec libellé : soumission, implicite, relais).
  2. **Authentification** : interrupteur Oui / Non, Identifiant, Mot de passe (masqué, bouton afficher, compteur « n / 16 » pour Gmail).
  3. **Expéditeur** : Adresse d'expédition (From), lien « Reprendre l'identifiant ».
  - Pied : état du brouillon, Annuler, Enregistrer.
- **Chemin d'envoi** (droite, panneau sombre) : 4 étapes (Connexion → Chiffrement → Authentification → Expédition), « Tester la connexion », encart d'erreur, e-mail de test, aperçu de l'expéditeur dans une boîte de réception.

## 2. Valeurs initiales
| Paramètre | Valeur |
|---|---|
| Serveur SMTP | smtp.gmail.com |
| Port | 587 |
| Chiffrement | TLS / STARTTLS |
| Authentification | Oui |
| Identifiant | (variable `SMTP_USER` du `.env` local : aucun identifiant réel dans le dépôt) |
| Mot de passe | (lu côté serveur, jamais renvoyé) |
| Adresse d'expédition (From) | (variable `SMTP_FROM` du `.env` local : aucun identifiant réel dans le dépôt) |

## 3. Règles
- Choisir un chiffrement propose son port (STARTTLS → 587, SSL/TLS → 465, Aucun → 25), sauf si l'utilisateur a saisi un port personnalisé.
- Incohérence port/chiffrement (465 + STARTTLS, 587 + SSL/TLS) : alerte rouge avec bouton de correction.
- Chiffrement « Aucun » : alerte ambre, bouton « Chiffrer ».
- Gmail + From ≠ identifiant : alerte ambre (Gmail réécrit l'expéditeur sauf alias vérifié).
- Validation : hôte (nom de domaine), port 1–65535, identifiant et mot de passe requis si l'authentification est activée, From au format e-mail.
- Toute modification invalide le dernier test. « Enregistrer » reste possible sans test, mais le pied de page invite à tester d'abord.
- L'e-mail de test n'est possible qu'après une connexion validée.

## 4. Erreurs affichées (code brut + aide en français)
| Cas | Étape | Code |
|---|---|---|
| Hôte introuvable | Connexion | `getaddrinfo ENOTFOUND` |
| 465 + STARTTLS / 587 + SSL | Chiffrement | `wrong version number` |
| Gmail sans chiffrement | Chiffrement | `530 5.7.0 Must issue a STARTTLS command first` |
| Gmail sans authentification | Authentification | `530 5.7.0 Authentication Required` |
| Identifiants refusés | Authentification | `535 5.7.8 Username and Password not accepted` |

En production, le backend renvoie l'étape en échec et la réponse SMTP réelle.

## 5. Sécurité
- Le mot de passe est chiffré au repos (KMS ou clé applicative). Il n'est **jamais** renvoyé au frontend : `GET` retourne `hasPassword: true`.
- Si le champ reste vide lors d'un `PUT`, le mot de passe existant est conservé.
- Le test et l'envoi sont exécutés côté serveur, jamais depuis le navigateur.
- Réservé au profil Admin.
- Régénérer le mot de passe d'application Google qui a circulé pendant la conception.

## 6. API proposée
| Action | Route |
|---|---|
| Lire | `GET /settings/smtp` → `{ host, port, enc, auth, user, from, hasPassword, lastTest }` |
| Enregistrer | `PUT /settings/smtp` |
| Tester la connexion | `POST /settings/smtp/test` (brouillon dans le corps) → `{ ok, step, code, ms }` |
| E-mail de test | `POST /settings/smtp/test-email { to }` |

## 7. Recette
1. Ouvrir la vue : valeurs du § 2, pastille « Configuré ».
2. Tester la connexion : les 4 étapes passent au vert l'une après l'autre.
3. Passer au port 465 en gardant STARTTLS : alerte rouge, « Passer au port 587 » corrige.
4. Raccourcir le mot de passe : le test échoue à l'étape Authentification avec le code 535.
5. Changer le From : alerte Gmail. « Reprendre l'identifiant » rétablit la valeur.
6. Désactiver l'authentification : les champs se replient et le test échoue avec le code 530.
7. Test réussi → e-mail de test envoyé → message « Remis à … ».
8. Modifier puis Annuler : retour aux valeurs enregistrées.
