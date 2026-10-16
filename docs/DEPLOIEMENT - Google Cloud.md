# Déploiement de RISE (Cockpit + Console) sur Google Cloud

Fiche pas à pas pour une plateforme utilisée par une dizaine de personnes (12/10/2026). Décision et hypothèses :
`docs/DECISIONS.md`, « Hébergement de production sur Google Cloud ».

Fichiers utilisés :

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | les trois services : PostgreSQL 18 + pgvector, API, Caddy (HTTPS) |
| `backend/Dockerfile` | image de l'API (compilation, migrations au démarrage) |
| `outils/gcp/env.prod.example` | modèle de `.env.prod` (secrets, domaine, SMTP, bucket) |
| `outils/gcp/Caddyfile` | HTTPS Let's Encrypt, flux SSE sans tampon, en-têtes de sécurité |
| `outils/gcp/sauvegarde.sh` | sauvegarde nocturne : base + fichiers, envoi dans Cloud Storage |
| `outils/gcp/restaurer.sh` | restauration (ou reprise initiale de la base du poste), tout ou rien |

---

## 1. Architecture retenue

```
Internet ──443──► VM Compute Engine e2-medium (Debian 12, Paris)
                    ├─ caddy      ports 80/443, certificat Let's Encrypt
                    ├─ api        NestJS, port 3000 interne, tâches pg-boss, flux SSE
                    └─ db         PostgreSQL 18 + pgvector, jamais exposé
                  Disque SSD 40 Go (instantané quotidien)
                  Bucket Cloud Storage (pg_dump + fichiers, 30 jours)
```

Pourquoi une VM et non Cloud Run : l'API exécute des tâches de fond toute la journée (`notifications.due` chaque
minute, agrégats, contrôles de santé, purges), garde des flux SSE ouverts (`/api/changes`, avancement des imports,
des rapports) et stocke ses fichiers sur disque (`STORAGE_DIR`). Une VM toujours allumée convient sans modifier le code.

Coût indicatif : **35 à 40 € par mois** (VM ≈ 27 €, disque ≈ 5 €, IP ≈ 3 €, sauvegardes ≈ 1 à 2 €), hors appels aux
modèles d'IA facturés par leurs fournisseurs.

## 2. Prérequis

- Un compte Google Cloud avec un **compte de facturation** (paiement à l'usage ; support « Basic » gratuit, suffisant).
- Un **nom de domaine** dont vous gérez les DNS (par exemple `cockpit.votre-domaine.fr`).
- Un **serveur SMTP** joignable sur le port 587 ou 465 (Microsoft 365, Brevo, SendGrid…) : Google Cloud bloque le port 25 sortant.
- Sur le poste : la **Google Cloud CLI** (`gcloud`), ou la **Cloud Shell** du navigateur (déjà équipée).
- Un accès en lecture au dépôt GitHub depuis la VM : une **clé de déploiement** en lecture seule (étape 6).

Dans les commandes ci-dessous, remplacer `rise-prod-xxxx` (identifiant du projet), `europe-west9` (Paris ;
`europe-west1`, Belgique, est un peu moins chère) et `gs://rise-sauvegardes-xxxx` (nom du bucket, unique au monde).

## 3. Projet, facturation et budget

```bash
gcloud projects create rise-prod-xxxx --name="RISE production"
gcloud config set project rise-prod-xxxx
gcloud services enable compute.googleapis.com storage.googleapis.com
```

Puis, dans la console web :

1. **Facturation** › associer le compte de facturation au projet.
2. **Facturation › Budgets et alertes** › budget mensuel de **60 €**, alertes à 50 %, 90 % et 100 %.

## 4. Réseau : adresse IP et pare-feu

```bash
# Adresse IP fixe
gcloud compute addresses create rise-ip --region=europe-west9

# Web : 80 (redirection et Let's Encrypt) et 443 (HTTPS, HTTP/3)
gcloud compute firewall-rules create rise-web --network=default \
  --allow=tcp:80,tcp:443,udp:443 --target-tags=rise-web

# Administration : SSH uniquement par IAP (plage de Google), jamais depuis Internet
gcloud compute firewall-rules create rise-ssh-iap --network=default \
  --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=rise-web
gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp --quiet
```

## 5. Bucket des sauvegardes et machine virtuelle

```bash
# Bucket en Europe, accès uniforme, objets supprimés au bout de 30 jours
gcloud storage buckets create gs://rise-sauvegardes-xxxx --location=europe-west9 --uniform-bucket-level-access
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > cycle.json
gcloud storage buckets update gs://rise-sauvegardes-xxxx --lifecycle-file=cycle.json

# Compte de service de la VM : écrire dans ce bucket, rien d'autre
gcloud iam service-accounts create rise-vm --display-name="VM RISE"
gcloud storage buckets add-iam-policy-binding gs://rise-sauvegardes-xxxx \
  --member=serviceAccount:rise-vm@rise-prod-xxxx.iam.gserviceaccount.com --role=roles/storage.objectAdmin

# VM : 2 vCPU, 4 Go, Debian 12, SSD 40 Go
gcloud compute instances create rise-prod --zone=europe-west9-a \
  --machine-type=e2-medium --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=40GB --boot-disk-type=pd-balanced \
  --address=rise-ip --tags=rise-web \
  --service-account=rise-vm@rise-prod-xxxx.iam.gserviceaccount.com --scopes=cloud-platform \
  --shielded-secure-boot

# Instantané quotidien du disque, gardé 14 jours
gcloud compute resource-policies create snapshot-schedule rise-quotidien --region=europe-west9 \
  --daily-schedule --start-time=01:00 --max-retention-days=14
gcloud compute disks add-resource-policies rise-prod --zone=europe-west9-a --resource-policies=rise-quotidien
```

Noter l'adresse IP (`gcloud compute addresses describe rise-ip --region=europe-west9 --format='value(address)'`)
et créer chez le registraire l'enregistrement DNS **A** `cockpit.votre-domaine.fr` → cette adresse.

## 6. Préparer la VM

```bash
gcloud compute ssh rise-prod --zone=europe-west9-a --tunnel-through-iap
```

Sur la VM :

```bash
# Docker et Git
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y git
sudo usermod -aG docker $USER   # puis se déconnecter et se reconnecter

# Mises à jour de sécurité automatiques du système
sudo apt-get install -y unattended-upgrades

# Dossier de l'application
sudo mkdir -p /opt/rise && sudo chown $USER:$USER /opt/rise

# Clé de déploiement GitHub (lecture seule)
ssh-keygen -t ed25519 -f ~/.ssh/rise_deploy -N "" -C "rise-prod"
cat ~/.ssh/rise_deploy.pub
```

Dans GitHub : dépôt `cszatsch/Cockpit` › **Settings › Deploy keys › Add deploy key**, coller la clé publique, sans
cocher « Allow write access ». Puis, sur la VM :

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/rise_deploy\n' >> ~/.ssh/config
git clone git@github.com:cszatsch/Cockpit.git /opt/rise
cd /opt/rise
git checkout <branche à déployer>
```

## 7. Configuration `.env.prod`

```bash
cd /opt/rise
cp outils/gcp/env.prod.example .env.prod && chmod 600 .env.prod
openssl rand -hex 24    # → POSTGRES_PASSWORD
openssl rand -hex 32    # → JWT_SECRET
nano .env.prod
```

Renseigner `DOMAINE`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `SECRETS_KEY`, le SMTP et
`BUCKET_SAUVEGARDES`. **`SECRETS_KEY`** dépend du choix de l'étape 8 :

- reprise de la base du poste : **la même valeur que `backend/.env` du poste**, sinon les clés API des fournisseurs
  et le mot de passe SMTP enregistrés deviennent illisibles ;
- base neuve : `openssl rand -hex 32`.

Dans les deux cas, garder une copie de `SECRETS_KEY` et `JWT_SECRET` **hors de la VM** (gestionnaire de mots de
passe) : sans `SECRETS_KEY`, une sauvegarde restaurée ne déchiffre plus ses clés.

`docker-compose.prod.yml` impose de lui-même `AUTH_DEV=false`, `DEMO_TODAY` vide, `OFFLINE=false`,
`JOBS_ENABLED=true`, `COOKIE_SECURE=true`, `TRUST_PROXY=1` et `APP_URL=https://<DOMAINE>`.

## 8. Données de départ : deux possibilités

### A. Reprendre la base du poste (conseillé si le paramétrage est déjà fait)

Comptes, habilitations, projets, modèles d'IA, skills, persona, templates de rapport et fichiers sont repris tels quels.

Sur le poste Windows (PowerShell, PostgreSQL local démarré par `start_cockpit`) :

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -p 5433 -U rise -Fc -f rise-reprise.dump rise
tar -czf storage-reprise.tar.gz -C backend\storage .
gcloud compute scp rise-reprise.dump storage-reprise.tar.gz rise-prod:/opt/rise/ --zone=europe-west9-a --tunnel-through-iap
```

Sur la VM :

```bash
cd /opt/rise
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
./outils/gcp/restaurer.sh rise-reprise.dump storage-reprise.tar.gz   # taper RESTAURER
rm rise-reprise.dump storage-reprise.tar.gz
```

Le script recrée les rôles de lecture de Jev (`jev_lecteur`, `jev_lecteur_cockpit`, que `pg_dump` n'emporte pas),
restaure dans une base temporaire puis bascule, et redémarre l'API, qui applique les migrations plus récentes.

### B. Base neuve

```bash
cd /opt/rise
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# Catalogue des fournisseurs et modèles d'IA
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npm run -s ia:catalogue -- --confirmer
# Compte initial : mot de passe provisoire saisi sans écho, jamais écrit dans un fichier ni l'historique
read -rs RISE_INITIAL_ADMIN_PASSWORD && export RISE_INITIAL_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -e RISE_INITIAL_ADMIN_PASSWORD api npm run -s init:admin
unset RISE_INITIAL_ADMIN_PASSWORD
```

Ne pas lancer `db:seed` en production : il vide la base et charge le jeu de démonstration.

## 9. Démarrage et vérifications

```bash
cd /opt/rise
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml ps            # api « healthy » au bout d'une à deux minutes
docker compose -f docker-compose.prod.yml logs -f api   # migrations puis « RISE API prête »
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate
```

Puis, dans le navigateur :

1. `https://cockpit.votre-domaine.fr/connexion` : cadenas valide, connexion au Cockpit.
2. `https://cockpit.votre-domaine.fr/console/connexion` : connexion à la Console.
3. `https://cockpit.votre-domaine.fr/?as=p01` ne doit **pas** connecter (preuve que `AUTH_DEV` est coupé).
4. Console › **Serveur SMTP** : « Tester », puis « Envoyer un e-mail de test ».
5. Console › **Fournisseurs et modèles** : clés API présentes (reprise) ou à saisir (base neuve), test de chaque clé.
6. Console › **Registre des cartes API** : contrôle de santé vert (la carte JEV sert à l'aiguillage de Jev).
7. Inviter un utilisateur : le lien de l'e-mail doit commencer par `https://cockpit.votre-domaine.fr`.

## 10. Sauvegardes

```bash
cd /opt/rise && ./outils/gcp/sauvegarde.sh     # premier essai à la main
gcloud storage ls gs://rise-sauvegardes-xxxx/
crontab -e
# ajouter :
30 21 * * * cd /opt/rise && ./outils/gcp/sauvegarde.sh >> sauvegardes/sauvegarde.log 2>&1
```

L'horloge de la VM est en UTC : 21:30 UTC = 22:30 (hiver) ou 23:30 (été) à Paris, avant l'arrêt nocturne (§ 12 bis).

Trois niveaux : `pg_dump` + fichiers chaque nuit dans le bucket (30 jours), 7 jours sur la VM, instantané du disque
complet chaque nuit (14 jours).

**Tester une restauration une fois**, avant l'ouverture aux utilisateurs :

```bash
gcloud storage cp "gs://rise-sauvegardes-xxxx/<horodatage>/*" /tmp/
./outils/gcp/restaurer.sh /tmp/rise-<horodatage>.dump /tmp/storage-<horodatage>.tar.gz
```

## 11. Mise à jour de l'application

```bash
cd /opt/rise
./outils/gcp/sauvegarde.sh                 # sauvegarde avant chaque mise à jour
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml logs -f api
```

Les migrations Prisma s'appliquent au démarrage de l'API. Interruption : environ une minute (reconstruction de l'image
avant l'arrêt de l'ancien conteneur). Retour arrière : `git checkout <commit précédent>`, reconstruire, et restaurer la
sauvegarde du jour si une migration a été appliquée.

## 12. Exploitation courante

| Besoin | Commande (dans `/opt/rise`) |
|---|---|
| État des services | `docker compose -f docker-compose.prod.yml ps` |
| Journal de l'API | `docker compose -f docker-compose.prod.yml logs --since 1h api` |
| Redémarrer l'API | `docker compose -f docker-compose.prod.yml --env-file .env.prod restart api` |
| Console SQL | `docker compose -f docker-compose.prod.yml exec db psql -U rise rise` |
| Place disque | `df -h /` et `docker system df` (nettoyage : `docker image prune -f`) |
| Traces de Jev | `docker compose -f docker-compose.prod.yml exec api npm run -s jev:traces -- --dernieres 5` |

Surveillance conseillée : **Monitoring › Uptime checks** sur `https://cockpit.votre-domaine.fr/connexion` (gratuit),
alerte par e-mail ; l'**Ops Agent** (mémoire, disque) est facultatif à cette échelle.

Le service redémarre seul après un redémarrage de la VM (`restart: unless-stopped`). Les journaux Docker tournent à
5 × 20 Mo par service.

Quand l'usage est stable (2 ou 3 mois), une **remise sur engagement d'un an** (Committed Use Discount) réduit le prix
de la VM d'environ 37 %.

## 12 bis. Arrêt nocturne de la VM (16/10/2026)

La VM est arrêtée chaque nuit de **00:00 à 07:00, heure de Paris** (changements d'heure suivis), par une planification
d'instance de Compute Engine ; seul le disque et l'adresse IP restent facturés pendant l'arrêt.

```bash
source ~/rise.env
PROJET=$(gcloud config get-value project); REGION=${ZONE%-*}
NUM=$(gcloud projects describe $PROJET --format='value(projectNumber)')
# L'agent de service de Compute Engine doit pouvoir démarrer et arrêter la VM
gcloud projects add-iam-policy-binding $PROJET --condition=None --quiet   --member=serviceAccount:service-$NUM@compute-system.iam.gserviceaccount.com --role=roles/compute.instanceAdmin.v1
gcloud compute resource-policies create instance-schedule rise-nuit --region=$REGION --timezone=Europe/Paris   --vm-stop-schedule='0 0 * * *' --vm-start-schedule='0 7 * * *' --description="Arrêt de la VM RISE de minuit à 7 h"
gcloud compute instances add-resource-policies $VM --zone=$ZONE --resource-policies=rise-nuit
```

- Arrêt et démarrage ont lieu dans les 15 minutes qui suivent l'heure prévue.
- Au démarrage, Docker relance les conteneurs (`restart: unless-stopped`) ; l'adresse IP est fixe (`rise-ip`).
- La sauvegarde nocturne doit tourner avant minuit (cron à 21:30 UTC, § 10) ; l'instantané du disque (01:00 UTC) se
  fait aussi VM arrêtée.
- Pendant l'arrêt, le Cockpit et la Console sont injoignables ; les envois de notifications prévus la nuit partent au
  redémarrage (rattrapage jusqu'au lendemain 23:59).
- Suspendre : `gcloud compute instances remove-resource-policies $VM --zone=$ZONE --resource-policies=rise-nuit` ;
  démarrer à la main : `gcloud compute instances start $VM --zone=$ZONE`.

## 13. Limites connues en production Linux

- **Console › Partager Cockpit** et `npm run livraison` construisent un paquet **Windows** (`tar.exe`, `pg_dump.exe`,
  `node.exe` : `src/admin/share-builder.ts`, « Windows seulement ») : ils ne fonctionnent pas sur la VM. Générer les
  paquets depuis le poste.
- **Documentation OpenAPI** (`/api/docs`) publique : elle décrit les routes sans donner accès aux données (toutes les
  routes exigent une session). Pour la masquer, ajouter dans le `Caddyfile` : `respond /api/docs* 404`.
- **Une seule VM** : pas de haute disponibilité. Une panne de la zone arrête le service jusqu'à recréation de la VM depuis
  le dernier instantané (environ 15 minutes), avec la perte des écritures depuis la dernière sauvegarde.
- **Données personnelles** : base et fichiers en Europe (région choisie) ; les appels aux modèles d'IA partent chez les
  fournisseurs configurés dans la Console.

## 14. Liste de contrôle de sécurité

- [ ] `AUTH_DEV` coupé (`?as=p01` refusé), `DEMO_TODAY` vide.
- [ ] `JWT_SECRET`, `SECRETS_KEY`, `POSTGRES_PASSWORD` tirés au hasard, `.env.prod` en `chmod 600`, copie des
      secrets hors de la VM.
- [ ] Ports ouverts : 80 et 443 seulement ; SSH par IAP ; PostgreSQL non exposé.
- [ ] Compte initial : mot de passe provisoire changé à la première connexion.
- [ ] Sauvegarde nocturne présente dans le bucket, restauration testée une fois.
- [ ] Alerte budgétaire et contrôle de disponibilité actifs.

## 15. Relais temporaire Cloud Run (filtre web de l'entreprise)

Cas rencontré en recette (13/10/2026) : le filtre web de l'entreprise (Zscaler) bloque `sslip.io` (catégorie « DNS
dynamique ») et l'autorisation d'un domaine prend plusieurs semaines. Les adresses `….run.app` de Google passent.
Un relais Cloud Run transmet alors tout à la VM, sans rien changer à l'application : `outils/gcp/relais/service.yaml`
(Caddy officiel, configuration dans la variable `CADDYFILE`, aucune image à construire).

```bash
gcloud services enable run.googleapis.com
gcloud run services replace outils/gcp/relais/service.yaml --region=europe-west9
gcloud run services add-iam-policy-binding cockpit --region=europe-west9 --member=allUsers --role=roles/run.invoker
```

Adresse : `https://cockpit-<numéro du projet>.europe-west9.run.app`. Liens des e-mails (invitations, mot de passe
oublié) : `APP_URL=<adresse du relais>` dans `.env.prod`, puis
`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api`.

Ce qui fonctionne : HTTPS, sessions (cookies liés à l'adresse visitée), jeton anti-CSRF, envois jusqu'à 260 Mo
(HTTP/2 de bout en bout, port `h2c` : sans lui, Cloud Run refuse les corps HTTP/1 de plus de 32 Mo), mises à jour en
direct (connexion rouverte par le navigateur au plus tard toutes les 60 minutes, `timeoutSeconds: 3600`).

Limites :

- l'API voit les adresses IP de Google et non celles des utilisateurs : le blocage après 20 échecs par IP
  (`IP_MAX_FAILURES`) vaut pour tous les utilisateurs du relais ensemble ; le blocage par adresse e-mail est inchangé ;
  la colonne « lieu » des sessions montre une adresse de Google ;
- coût : Cloud Run facture tant qu'une requête est en cours, et chaque onglet ouvert garde son flux de mises à jour
  ouvert, soit environ 10 à 15 € par mois si des onglets restent ouverts toute la journée ;
- l'adresse `sslip.io` reste ouverte (téléphones, réseaux hors entreprise) : session distincte pour le navigateur.

Retrait, une fois le domaine définitif autorisé : vider `APP_URL` dans `.env.prod` (ou le domaine dans `DOMAINE`),
redémarrer l'API, puis `gcloud run services delete cockpit --region=europe-west9`.
