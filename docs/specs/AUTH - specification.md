# AUTH — Spécification backend (écrans d'authentification)

Sources front : `Authentification.dc.html` (composant partagé), `Connexion.dc.html` (application), `Connexion Console.dc.html` (administration). La logique du composant est une **simulation** : comptes et mots de passe de démo à supprimer, toute vérification se fait côté serveur.

## URLs
- Application : `/connexion` → après succès `/` (Cockpit)
- Administration : `/console/connexion` → après succès `/console`
- Réinitialisation : `/mot-de-passe/reinitialiser?token=…` (commune, retour vers la surface d'origine)
- Toute route `/console/*` exige une session avec le rôle `admin` ; sinon redirection vers `/console/connexion` (non connecté) ou écran « Accès non autorisé » (connecté sans droit, tentative journalisée).

## Connexion
- `POST /api/auth/login {email, password, surface}` → 200 | 401 générique « Identifiant ou mot de passe incorrect » (jamais de distinction e-mail / mot de passe, temps de réponse constant).
- Vérification du format e-mail côté client ET serveur.
- Verrouillage : 5 échecs consécutifs → blocage 15 min (compteur par compte + par IP). Réponse `423 {retryAfter}` ; même réponse si l'adresse n'existe pas.
- À partir du 3e échec, le front affiche le nombre de tentatives restantes (`remaining` dans la réponse 401).
- `surface=admin` + compte sans rôle admin → `403` après authentification, entrée au journal d'audit.
- Compte avec `must_change_password=true` → `200 {mustChangePassword:true}` ; session restreinte à l'écran « Première connexion ».

## Session
- Cookie `HttpOnly; Secure; SameSite=Strict`, jeton rotatif, protection CSRF.
- Inactivité : 30 min (application), 15 min (console). Avertissement modal 60 s avant expiration (« Toujours là ? ») ; « Rester connecté » prolonge via `POST /api/auth/keepalive`.
- Déconnexion : `POST /api/auth/logout` invalide la session serveur → écran de connexion avec bandeau « Vous êtes déconnecté ». Déjà câblé dans le Cockpit (bouton du profil, sidebar).

## Mot de passe oublié
- `POST /api/auth/forgot {email}` → toujours 202, message neutre « Si un compte existe pour cette adresse, un e-mail vous a été envoyé ».
- Jeton aléatoire 256 bits, stocké haché, usage unique, validité 30 min. Renvoi limité (60 s entre deux envois, 5 par heure).
- `GET /api/auth/reset/verify?token=` → valide | expiré/utilisé (écran « Ce lien n'est plus valide »).
- `POST /api/auth/reset {token, password}` → invalide le jeton et toutes les sessions actives du compte.

## Règles de mot de passe (front + serveur)
12 caractères minimum, majuscule et minuscule, un chiffre, un caractère spécial. Côté serveur en plus : différent du précédent, absent des listes de mots de passe compromis. Hachage **Argon2id** (ou bcrypt coût ≥ 12).

## Pas d'inscription
Aucune route publique de création de compte. Création uniquement depuis la Console (Utilisateurs).

## Compte initial (script de seed)
- Cédric Schmitz — `c.schmitz@groupeonepoint.com` — rôles : `admin` (plateforme) + `PMO` (application).
- Mot de passe lu depuis la variable d'environnement `RISE_INITIAL_ADMIN_PASSWORD` au premier démarrage, haché immédiatement, jamais écrit dans le code ni les logs. `must_change_password=true`.
- Le script refuse de s'exécuter si la variable est absente ou si le compte existe déjà.

## Accessibilité
Libellés `<label for>`, `aria-invalid` / `aria-describedby` sur les champs, messages d'erreur en `role="alert"`, minuteurs en `role="timer"`, modal d'expiration en `role="alertdialog"` (Échap = rester connecté), navigation complète au clavier, `autocomplete` (`username`, `current-password`, `new-password`), `prefers-reduced-motion` respecté.
