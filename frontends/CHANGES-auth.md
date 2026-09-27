# Écrans d'authentification — modifications du frontend livré

Livraison d'origine : `Authentification.dc.html` (composant partagé), `Connexion.dc.html` (application), `Connexion Console.dc.html` (administration), versés à l'identique au commit `5f234ac` avec leur spécification (`docs/specs/AUTH - specification.md`). Les écarts ci-dessous se lisent avec `git diff 5f234ac -- frontends/`. Le design, les textes et les états restent ceux de la livraison.

## Fichiers non repris

- **`auth-bundle.js`** : il embarque le composant pour une ouverture en `file://` (« inutile via un serveur », dit son en-tête). Les écrans sont servis par l'API, qui sert aussi `Authentification.dc.html` ; une copie figée deviendrait fausse à la première modification.
- **`support.js` de la livraison** : le dépôt garde le sien, commun à tous les écrans. Le composant s'affiche et fonctionne à l'identique avec lui (vérifié dans le navigateur).

## `Connexion.dc.html` et `Connexion Console.dc.html`

| Modification | Raison |
|---|---|
| `<script src="./auth-bundle.js">` retiré | voir ci-dessus |
| `<base href="/">` ajouté | les écrans sont servis à `/connexion`, `/console/connexion` et `/mot-de-passe/reinitialiser` : sans base, `./support.js` et `./Authentification.dc.html` seraient cherchés sous `/console/` ou `/mot-de-passe/` |
| `<title>` ajouté | titre de l'onglet (« Connexion · RISE Cockpit », « Connexion · Console RISE ») |
| propriété `demo` retirée | la spécification demande de supprimer les comptes et mots de passe de démonstration |

## `Authentification.dc.html`

### Logique (`class Component`)

La simulation est remplacée par les appels au serveur (`auth-api.js` → `/api/auth/…`). Les états, les minuteurs, les règles affichées du mot de passe et les styles calculés sont inchangés.

| Élément | Avant (simulation) | Après |
|---|---|---|
| Comptes | `state.accts` : deux comptes avec leur mot de passe en clair | supprimés ; aucun compte ni mot de passe dans le navigateur |
| Connexion | comparaison locale, compteur local | `POST /api/auth/login` : 200 (ou « Première connexion » si `mustChangePassword`), 401 générique avec `remaining`, 423 avec `retryAfter` (écran « Connexion suspendue »), 403 (« Accès non autorisé »), injoignable → bandeau « Service indisponible » |
| Après connexion | écran « Bonjour » avec bouton | même écran, puis ouverture automatique (0,9 s) de `/`, `/console` ou de l'adresse demandée (`?suite=`, chemin local seulement) |
| Mot de passe oublié | passage direct à « Vérifiez votre messagerie » | `POST /api/auth/forgot` ; « Renvoyer » refait l'appel (le serveur limite à un envoi par minute et cinq par heure) |
| Lien reçu par e-mail | bouton « Ouvrir le lien » du panneau démo | `/mot-de-passe/reinitialiser?token=…` : `GET /reset/verify` → « Nouveau mot de passe » ou « Ce lien n'est plus valide » ; le jeton est retiré de l'adresse dès la lecture |
| Nouveau mot de passe | enregistrement local | première connexion : `POST /api/auth/password` ; lien : `POST /api/auth/reset` (410 → lien invalide) ; refus du serveur (compromis, identique au précédent) affiché |
| « Mot de passe modifié » | retour à la connexion après 6 s | idem, l'adresse devient celle de l'écran de connexion de la surface |
| Ouverture de l'écran | état `Connexion` | `GET /api/auth/session` : session déjà ouverte → page d'arrivée ; mot de passe provisoire → « Première connexion » ; `?raison=expiree` / `deconnecte` → bandeaux « Session expirée » / « Vous êtes déconnecté » |
| « Se déconnecter » (écran « Bonjour ») | retour local à la connexion | `POST /api/auth/logout` |
| Durée d'un lien | `mm:ss` | `mm:ss` sous une heure ; au-delà (lien d'invitation, 14 jours) en heures ou en jours |
| `scenario` | états de démonstration | conservé pour l'aperçu de conception : un état autre que « Connexion » s'affiche sans appel au serveur, avec des données fictives sans mot de passe |
| `onLogin`, `onForgot`, `onSetPwd` | méthodes absentes de `renderVals()` | ajoutées à `renderVals()` : le moteur (`support.js`) ne résout que ses valeurs ; sans elles, `onSubmit` était vide et le formulaire partait en envoi natif (rechargement de la page) |

### Gabarit

| Emplacement | Modification | Raison |
|---|---|---|
| bandeau d'erreur | texte `{{ errTitle }}` : « Identifiant ou mot de passe incorrect. » ou « Service indisponible. Réessayez dans un instant. » | un serveur injoignable ne doit pas être présenté comme une erreur d'identifiants |
| formulaire « nouveau mot de passe » | bloc `role="alert"` après la confirmation, même dessin que le bandeau d'erreur | afficher le refus du serveur (mot de passe compromis, identique au précédent) |
| lien « Connexion au Cockpit » (console) et « Aller à l'application » (accès refusé) | `href="/connexion"` au lieu de `Connexion.dc.html` | adresse de l'écran de connexion de l'application |
| panneau « DÉMO » | supprimé | comptes et mots de passe de démonstration (spécification) |

## `auth-api.js` (nouveau)

Module partagé par les écrans de connexion, le Cockpit (`api.js`) et la Console (`admin-api.js`) : appels `/api/auth/…`, en-têtes `X-Rise-Surface` et `X-CSRF-Token`, déconnexion, retour à la connexion, et surveillance de l'inactivité. Le dialogue « Toujours là ? » reprend le dessin de l'état « Session sur le point d'expirer » du composant (compte à rebours, `role="alertdialog"`, Échap = rester connecté, focus retenu dans la fenêtre).

## Fenêtre « Modifier le mot de passe » (`auth-api.js`, 28/09/2026)

`openPasswordDialog({ send, onDone })`, ouverte par « Mon profil › Sécurité › Modifier » du Cockpit et de la Console : mot de passe actuel, nouveau mot de passe et confirmation, avec les boutons afficher / masquer, les quatre règles et la jauge des écrans de connexion. Le refus du mot de passe actuel s'affiche sous son champ ; les autres refus du serveur (règles, mot de passe compromis ou identique) s'affichent dans un bandeau `role="alert"`. C'est une fenêtre modale (`role="dialog"`, `aria-modal`) : Échap ou « Annuler » la ferment, Tab reste à l'intérieur, et le focus revient ensuite sur « Modifier ». Couleur d'action : le vert des boutons « Enregistrer » du profil (`#1d8f86`).
