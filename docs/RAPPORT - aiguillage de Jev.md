# Rapport de test — aiguillage des questions de Jev (Console)

Généré par `npm run jev:aiguillage` le 30/09/2026 16:13:47. Jeu de test : `backend/test/fixtures/jev-routage.json` (50 questions : 20 USAGE, 20 DONNÉES, 10 pièges), types attendus justifiés avant tout appel à l'API.

## Synthèse par version des consignes

| Version | Passages | Global | Non ambiguës (objectif ≥ 95 %) | USAGE | DONNÉES | Pièges | Par passage | Questions instables | Temps moyen / médian / max | Replis |
|---|---|---|---|---|---|---|---|---|---|---|
| v1 | 3 | 94 % (141/150) | 97.8 % (135/138) | 100 % (60/60) | 95 % (57/60) | 80 % (24/30) | 94 % · 94 % · 94 % | D04 | 246 / 241 / 381 ms | 0 |
| v2 | 3 | 98 % (147/150) | 100 % (138/138) | 100 % (60/60) | 100 % (60/60) | 90 % (27/30) | 98 % · 98 % · 98 % | aucune | 247 / 241 / 492 ms | 0 |
| v3 | 3 | 94 % (141/150) | 95.7 % (132/138) | 100 % (60/60) | 90 % (54/60) | 90 % (27/30) | 94 % · 94 % · 94 % | aucune | 247 / 241 / 631 ms | 0 |

## Version v1 — détail

Consignes : voir `ROUTER_PROMPTS.v1` (`backend/src/domain/jev-router.ts`). Seuil de confiance : 0.5 (en deçà : AMBIGU).

### Matrice de confusion (lignes : type attendu, colonnes : type obtenu, tous passages)

| Attendu \ Obtenu | USAGE | DONNEES | AMBIGU | HORS_SUJET |
|---|---|---|---|---|
| USAGE | **66** | · | · | · |
| DONNEES | 1 | **63** | 2 | · |
| AMBIGU | 6 | · | **6** | · |
| HORS_SUJET | · | · | · | **6** |

### Tableau détaillé (passage 1 ; les passages suivants signalés s’ils diffèrent)

| Id | Question | Attendu | Obtenu | Option | Confiance | Temps | Correct | Autres passages |
|---|---|---|---|---|---|---|---|---|
| U01 | Comment déposer le guide utilisateur ? | USAGE | USAGE | usage | 1.00 | 333 ms | oui | — |
| U02 | Comment inviter un nouvel utilisateur sur un projet ? | USAGE | USAGE | usage | 1.00 | 233 ms | oui | — |
| U03 | À quoi sert la page Snapshots ? | USAGE | USAGE | usage | 1.00 | 263 ms | oui | — |
| U04 | Quelle est la durée de validité d'un lien d'invitation ? | USAGE | USAGE | usage | 1.00 | 245 ms | oui | — |
| U05 | Comment fonctionne la règle de rattrapage des notifications ? | USAGE | USAGE | usage | 1.00 | 242 ms | oui | — |
| U06 | Où est-ce que je règle le plafond budgétaire de l'IA ? | USAGE | USAGE | usage | 1.00 | 232 ms | oui | — |
| U07 | Comment remplacer une clé API refusée ? | USAGE | USAGE | usage | 1.00 | 239 ms | oui | — |
| U08 | Pourquoi je ne peux pas supprimer un compte ? | USAGE | USAGE | usage | 1.00 | 203 ms | oui | — |
| U09 | Quelle différence entre suspendre et supprimer un compte ? | USAGE | USAGE | usage | 1.00 | 215 ms | oui | — |
| U10 | Comment créer une règle de notification hebdomadaire ? | USAGE | USAGE | usage | 1.00 | 205 ms | oui | — |
| U11 | Qu'est-ce qu'un modèle de secours ? | USAGE | USAGE | usage | 1.00 | 245 ms | oui | — |
| U12 | Comment restaurer un projet à un état antérieur ? | USAGE | USAGE | usage | 1.00 | 348 ms | oui | — |
| U13 | Combien de temps le journal d'audit est-il conservé ? | USAGE | USAGE | usage | 0.97 | 264 ms | oui | — |
| U14 | Est-ce que le dépassement du plafond bloque les appels à l'IA ? | USAGE | USAGE | usage | 1.00 | 256 ms | oui | — |
| U15 | Comment initialiser un projet à partir du fichier Excel ? | USAGE | USAGE | usage | 1.00 | 197 ms | oui | — |
| U16 | Que signifie le statut « Remplacé » dans l'historique des envois ? | USAGE | USAGE | usage | 0.99 | 256 ms | oui | — |
| U17 | Comment ajouter un administrateur ? | USAGE | USAGE | usage | 1.00 | 233 ms | oui | — |
| U18 | Quelles sont les règles du mot de passe ? | USAGE | USAGE | usage | 1.00 | 278 ms | oui | — |
| U19 | Comment activer le module Budget sur un seul projet ? | USAGE | USAGE | usage | 1.00 | 236 ms | oui | — |
| U20 | À quoi correspond l'espace À traiter de la vue d'ensemble ? | USAGE | USAGE | usage | 1.00 | 225 ms | oui | — |
| D01 | Combien de notifications ont échoué cette semaine ? | DONNEES | DONNEES | donnees | 1.00 | 249 ms | oui | — |
| D02 | Quels utilisateurs ne se sont pas connectés depuis 30 jours ? | DONNEES | DONNEES | donnees | 1.00 | 241 ms | oui | — |
| D03 | Combien avons-nous dépensé en IA ce mois-ci ? | DONNEES | DONNEES | donnees | 1.00 | 208 ms | oui | — |
| D04 | Qui est PMO sur le projet RISE ? | DONNEES | USAGE | usage | 0.55 | 261 ms | **non** | p2 : AMBIGU (0.43) ; p3 : AMBIGU (0.30) |
| D05 | Liste les invitations en attente | DONNEES | DONNEES | donnees | 1.00 | 228 ms | oui | — |
| D06 | Quel est le modèle principal de la fonction Guidage console ? | DONNEES | DONNEES | donnees | 0.56 | 226 ms | oui | p2 : DONNEES (0.65) ; p3 : DONNEES (0.66) |
| D07 | Quelles actions sensibles ont été faites hier ? | DONNEES | DONNEES | donnees | 1.00 | 238 ms | oui | — |
| D08 | Combien de projets sont actifs ? | DONNEES | DONNEES | donnees | 1.00 | 208 ms | oui | — |
| D09 | Quelle est la date du dernier snapshot de RISE ? | DONNEES | DONNEES | donnees | 1.00 | 304 ms | oui | — |
| D10 | Quelles cartes API sont en erreur en ce moment ? | DONNEES | DONNEES | donnees | 1.00 | 203 ms | oui | — |
| D11 | Quel est l'appel IA le plus cher du mois ? | DONNEES | DONNEES | donnees | 1.00 | 236 ms | oui | — |
| D12 | Combien de comptes sont suspendus ? | DONNEES | DONNEES | donnees | 1.00 | 250 ms | oui | — |
| D13 | Quelles règles de notification sont actives ? | DONNEES | DONNEES | donnees | 0.71 | 244 ms | oui | — |
| D14 | Montre-moi les demandes de module en attente | DONNEES | DONNEES | donnees | 1.00 | 227 ms | oui | — |
| D15 | Quel fournisseur IA a une clé invalide ? | DONNEES | DONNEES | donnees | 1.00 | 246 ms | oui | — |
| D16 | Combien de tokens a consommé la fonction Insights en septembre ? | DONNEES | DONNEES | donnees | 1.00 | 240 ms | oui | — |
| D17 | Qui a modifié le plafond budgétaire en dernier ? | DONNEES | DONNEES | donnees | 1.00 | 290 ms | oui | — |
| D18 | Quels sont les droits de Karim Benali ? | DONNEES | DONNEES | donnees | 1.00 | 232 ms | oui | — |
| D19 | Le serveur SMTP est-il configuré ? | DONNEES | DONNEES | donnees | 1.00 | 266 ms | oui | — |
| D20 | Combien de sessions sont ouvertes actuellement ? | DONNEES | DONNEES | donnees | 1.00 | 272 ms | oui | — |
| P01 | Pourquoi mes notifications n'apparaissent pas dans « À traiter » ? | AMBIGU | USAGE | usage | 0.90 | 247 ms | **non** | — |
| P02 | La clé Google est invalide, comment je la remplace et quelles fonctions sont touchées ? | AMBIGU | USAGE | usage | 1.00 | 201 ms | **non** | — |
| P03 | Et le budget ? | AMBIGU | AMBIGU | mixte | 0.55 | 241 ms | oui | p2 : AMBIGU (0.50) |
| P04 | Quelle est la capitale de l'Australie ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 265 ms | oui | — |
| P05 | Peux-tu m'écrire un poème sur l'automne ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 217 ms | oui | — |
| P06 | invitations ? | AMBIGU | AMBIGU | mixte | 0.35 | 269 ms | oui | p2 : AMBIGU (0.41) ; p3 : AMBIGU (0.44) |
| P07 | coment on fai pour suspendre un conte | USAGE | USAGE | usage | 1.00 | 253 ms | oui | — |
| P08 | combein de notifs en echec cete semaine | DONNEES | DONNEES | donnees | 1.00 | 226 ms | oui | — |
| P09 | Et pour le mois dernier ? *(suite de : « Combien avons-nous dépensé en IA ce mois-ci ? »)* | DONNEES | DONNEES | donnees | 1.00 | 356 ms | oui | — |
| P10 | Et pour un administrateur ? *(suite de : « Comment inviter un nouvel utilisateur sur un projet ? »)* | USAGE | USAGE | usage | 0.99 | 209 ms | oui | — |

## Version v2 — détail

Consignes : voir `ROUTER_PROMPTS.v2` (`backend/src/domain/jev-router.ts`). Seuil de confiance : 0.5 (en deçà : AMBIGU).

### Matrice de confusion (lignes : type attendu, colonnes : type obtenu, tous passages)

| Attendu \ Obtenu | USAGE | DONNEES | AMBIGU | HORS_SUJET |
|---|---|---|---|---|
| USAGE | **66** | · | · | · |
| DONNEES | · | **66** | · | · |
| AMBIGU | 3 | · | **9** | · |
| HORS_SUJET | · | · | · | **6** |

### Tableau détaillé (passage 1 ; les passages suivants signalés s’ils diffèrent)

| Id | Question | Attendu | Obtenu | Option | Confiance | Temps | Correct | Autres passages |
|---|---|---|---|---|---|---|---|---|
| U01 | Comment déposer le guide utilisateur ? | USAGE | USAGE | usage | 1.00 | 309 ms | oui | — |
| U02 | Comment inviter un nouvel utilisateur sur un projet ? | USAGE | USAGE | usage | 1.00 | 254 ms | oui | — |
| U03 | À quoi sert la page Snapshots ? | USAGE | USAGE | usage | 1.00 | 219 ms | oui | — |
| U04 | Quelle est la durée de validité d'un lien d'invitation ? | USAGE | USAGE | usage | 0.99 | 257 ms | oui | — |
| U05 | Comment fonctionne la règle de rattrapage des notifications ? | USAGE | USAGE | usage | 1.00 | 226 ms | oui | — |
| U06 | Où est-ce que je règle le plafond budgétaire de l'IA ? | USAGE | USAGE | usage | 1.00 | 241 ms | oui | — |
| U07 | Comment remplacer une clé API refusée ? | USAGE | USAGE | usage | 0.98 | 263 ms | oui | — |
| U08 | Pourquoi je ne peux pas supprimer un compte ? | USAGE | USAGE | usage | 0.68 | 225 ms | oui | p3 : USAGE (0.63) |
| U09 | Quelle différence entre suspendre et supprimer un compte ? | USAGE | USAGE | usage | 1.00 | 216 ms | oui | — |
| U10 | Comment créer une règle de notification hebdomadaire ? | USAGE | USAGE | usage | 1.00 | 231 ms | oui | — |
| U11 | Qu'est-ce qu'un modèle de secours ? | USAGE | USAGE | usage | 1.00 | 390 ms | oui | — |
| U12 | Comment restaurer un projet à un état antérieur ? | USAGE | USAGE | usage | 0.99 | 229 ms | oui | — |
| U13 | Combien de temps le journal d'audit est-il conservé ? | USAGE | USAGE | usage | 0.97 | 219 ms | oui | — |
| U14 | Est-ce que le dépassement du plafond bloque les appels à l'IA ? | USAGE | USAGE | usage | 0.98 | 222 ms | oui | — |
| U15 | Comment initialiser un projet à partir du fichier Excel ? | USAGE | USAGE | usage | 1.00 | 232 ms | oui | — |
| U16 | Que signifie le statut « Remplacé » dans l'historique des envois ? | USAGE | USAGE | usage | 0.99 | 374 ms | oui | — |
| U17 | Comment ajouter un administrateur ? | USAGE | USAGE | usage | 1.00 | 299 ms | oui | — |
| U18 | Quelles sont les règles du mot de passe ? | USAGE | USAGE | usage | 0.98 | 230 ms | oui | — |
| U19 | Comment activer le module Budget sur un seul projet ? | USAGE | USAGE | usage | 1.00 | 295 ms | oui | — |
| U20 | À quoi correspond l'espace À traiter de la vue d'ensemble ? | USAGE | USAGE | usage | 0.99 | 290 ms | oui | — |
| D01 | Combien de notifications ont échoué cette semaine ? | DONNEES | DONNEES | donnees | 1.00 | 238 ms | oui | — |
| D02 | Quels utilisateurs ne se sont pas connectés depuis 30 jours ? | DONNEES | DONNEES | donnees | 0.99 | 205 ms | oui | — |
| D03 | Combien avons-nous dépensé en IA ce mois-ci ? | DONNEES | DONNEES | donnees | 1.00 | 249 ms | oui | — |
| D04 | Qui est PMO sur le projet RISE ? | DONNEES | DONNEES | donnees | 0.84 | 207 ms | oui | p2 : DONNEES (0.92) |
| D05 | Liste les invitations en attente | DONNEES | DONNEES | donnees | 1.00 | 221 ms | oui | — |
| D06 | Quel est le modèle principal de la fonction Guidage console ? | DONNEES | DONNEES | donnees | 0.81 | 217 ms | oui | — |
| D07 | Quelles actions sensibles ont été faites hier ? | DONNEES | DONNEES | donnees | 0.99 | 217 ms | oui | — |
| D08 | Combien de projets sont actifs ? | DONNEES | DONNEES | donnees | 1.00 | 266 ms | oui | — |
| D09 | Quelle est la date du dernier snapshot de RISE ? | DONNEES | DONNEES | donnees | 1.00 | 218 ms | oui | — |
| D10 | Quelles cartes API sont en erreur en ce moment ? | DONNEES | DONNEES | donnees | 1.00 | 217 ms | oui | — |
| D11 | Quel est l'appel IA le plus cher du mois ? | DONNEES | DONNEES | donnees | 1.00 | 267 ms | oui | — |
| D12 | Combien de comptes sont suspendus ? | DONNEES | DONNEES | donnees | 1.00 | 266 ms | oui | — |
| D13 | Quelles règles de notification sont actives ? | DONNEES | DONNEES | donnees | 0.98 | 225 ms | oui | — |
| D14 | Montre-moi les demandes de module en attente | DONNEES | DONNEES | donnees | 0.99 | 265 ms | oui | — |
| D15 | Quel fournisseur IA a une clé invalide ? | DONNEES | DONNEES | donnees | 1.00 | 204 ms | oui | — |
| D16 | Combien de tokens a consommé la fonction Insights en septembre ? | DONNEES | DONNEES | donnees | 1.00 | 220 ms | oui | — |
| D17 | Qui a modifié le plafond budgétaire en dernier ? | DONNEES | DONNEES | donnees | 0.99 | 250 ms | oui | — |
| D18 | Quels sont les droits de Karim Benali ? | DONNEES | DONNEES | donnees | 1.00 | 250 ms | oui | — |
| D19 | Le serveur SMTP est-il configuré ? | DONNEES | DONNEES | donnees | 1.00 | 223 ms | oui | — |
| D20 | Combien de sessions sont ouvertes actuellement ? | DONNEES | DONNEES | donnees | 1.00 | 251 ms | oui | — |
| P01 | Pourquoi mes notifications n'apparaissent pas dans « À traiter » ? | AMBIGU | AMBIGU | mixte | 0.64 | 215 ms | oui | — |
| P02 | La clé Google est invalide, comment je la remplace et quelles fonctions sont touchées ? | AMBIGU | USAGE | usage | 0.78 | 260 ms | **non** | p2 : USAGE (0.66) ; p3 : USAGE (0.69) |
| P03 | Et le budget ? | AMBIGU | AMBIGU | mixte | 0.38 | 240 ms | oui | — |
| P04 | Quelle est la capitale de l'Australie ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 278 ms | oui | — |
| P05 | Peux-tu m'écrire un poème sur l'automne ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 246 ms | oui | — |
| P06 | invitations ? | AMBIGU | AMBIGU | mixte | 0.48 | 226 ms | oui | p3 : AMBIGU (0.53) |
| P07 | coment on fai pour suspendre un conte | USAGE | USAGE | usage | 0.99 | 378 ms | oui | — |
| P08 | combein de notifs en echec cete semaine | DONNEES | DONNEES | donnees | 1.00 | 236 ms | oui | — |
| P09 | Et pour le mois dernier ? *(suite de : « Combien avons-nous dépensé en IA ce mois-ci ? »)* | DONNEES | DONNEES | donnees | 1.00 | 215 ms | oui | — |
| P10 | Et pour un administrateur ? *(suite de : « Comment inviter un nouvel utilisateur sur un projet ? »)* | USAGE | USAGE | usage | 0.96 | 236 ms | oui | — |

## Version v3 — détail

Consignes : voir `ROUTER_PROMPTS.v3` (`backend/src/domain/jev-router.ts`). Seuil de confiance : 0.5 (en deçà : AMBIGU).

### Matrice de confusion (lignes : type attendu, colonnes : type obtenu, tous passages)

| Attendu \ Obtenu | USAGE | DONNEES | AMBIGU | HORS_SUJET |
|---|---|---|---|---|
| USAGE | **66** | · | · | · |
| DONNEES | · | **60** | 6 | · |
| AMBIGU | 3 | · | **9** | · |
| HORS_SUJET | · | · | · | **6** |

### Tableau détaillé (passage 1 ; les passages suivants signalés s’ils diffèrent)

| Id | Question | Attendu | Obtenu | Option | Confiance | Temps | Correct | Autres passages |
|---|---|---|---|---|---|---|---|---|
| U01 | Comment déposer le guide utilisateur ? | USAGE | USAGE | usage | 1.00 | 300 ms | oui | — |
| U02 | Comment inviter un nouvel utilisateur sur un projet ? | USAGE | USAGE | usage | 1.00 | 271 ms | oui | — |
| U03 | À quoi sert la page Snapshots ? | USAGE | USAGE | usage | 1.00 | 307 ms | oui | — |
| U04 | Quelle est la durée de validité d'un lien d'invitation ? | USAGE | USAGE | usage | 0.99 | 223 ms | oui | — |
| U05 | Comment fonctionne la règle de rattrapage des notifications ? | USAGE | USAGE | usage | 0.99 | 209 ms | oui | — |
| U06 | Où est-ce que je règle le plafond budgétaire de l'IA ? | USAGE | USAGE | usage | 1.00 | 256 ms | oui | — |
| U07 | Comment remplacer une clé API refusée ? | USAGE | USAGE | usage | 0.98 | 241 ms | oui | — |
| U08 | Pourquoi je ne peux pas supprimer un compte ? | USAGE | USAGE | usage | 0.64 | 231 ms | oui | — |
| U09 | Quelle différence entre suspendre et supprimer un compte ? | USAGE | USAGE | usage | 1.00 | 201 ms | oui | — |
| U10 | Comment créer une règle de notification hebdomadaire ? | USAGE | USAGE | usage | 1.00 | 230 ms | oui | — |
| U11 | Qu'est-ce qu'un modèle de secours ? | USAGE | USAGE | usage | 1.00 | 221 ms | oui | — |
| U12 | Comment restaurer un projet à un état antérieur ? | USAGE | USAGE | usage | 1.00 | 242 ms | oui | — |
| U13 | Combien de temps le journal d'audit est-il conservé ? | USAGE | USAGE | usage | 0.95 | 229 ms | oui | — |
| U14 | Est-ce que le dépassement du plafond bloque les appels à l'IA ? | USAGE | USAGE | usage | 0.99 | 249 ms | oui | — |
| U15 | Comment initialiser un projet à partir du fichier Excel ? | USAGE | USAGE | usage | 1.00 | 227 ms | oui | — |
| U16 | Que signifie le statut « Remplacé » dans l'historique des envois ? | USAGE | USAGE | usage | 0.99 | 234 ms | oui | — |
| U17 | Comment ajouter un administrateur ? | USAGE | USAGE | usage | 1.00 | 247 ms | oui | — |
| U18 | Quelles sont les règles du mot de passe ? | USAGE | USAGE | usage | 0.98 | 231 ms | oui | — |
| U19 | Comment activer le module Budget sur un seul projet ? | USAGE | USAGE | usage | 1.00 | 272 ms | oui | — |
| U20 | À quoi correspond l'espace À traiter de la vue d'ensemble ? | USAGE | USAGE | usage | 0.98 | 268 ms | oui | — |
| D01 | Combien de notifications ont échoué cette semaine ? | DONNEES | DONNEES | donnees | 1.00 | 247 ms | oui | — |
| D02 | Quels utilisateurs ne se sont pas connectés depuis 30 jours ? | DONNEES | DONNEES | donnees | 0.99 | 260 ms | oui | — |
| D03 | Combien avons-nous dépensé en IA ce mois-ci ? | DONNEES | DONNEES | donnees | 1.00 | 311 ms | oui | — |
| D04 | Qui est PMO sur le projet RISE ? | DONNEES | DONNEES | donnees | 0.78 | 251 ms | oui | p3 : DONNEES (0.89) |
| D05 | Liste les invitations en attente | DONNEES | DONNEES | donnees | 1.00 | 225 ms | oui | — |
| D06 | Quel est le modèle principal de la fonction Guidage console ? | DONNEES | AMBIGU | donnees | 0.85 | 244 ms | **non** | — |
| D07 | Quelles actions sensibles ont été faites hier ? | DONNEES | DONNEES | donnees | 0.99 | 278 ms | oui | — |
| D08 | Combien de projets sont actifs ? | DONNEES | DONNEES | donnees | 1.00 | 239 ms | oui | — |
| D09 | Quelle est la date du dernier snapshot de RISE ? | DONNEES | DONNEES | donnees | 1.00 | 228 ms | oui | — |
| D10 | Quelles cartes API sont en erreur en ce moment ? | DONNEES | DONNEES | donnees | 1.00 | 244 ms | oui | — |
| D11 | Quel est l'appel IA le plus cher du mois ? | DONNEES | DONNEES | donnees | 1.00 | 263 ms | oui | — |
| D12 | Combien de comptes sont suspendus ? | DONNEES | DONNEES | donnees | 1.00 | 264 ms | oui | — |
| D13 | Quelles règles de notification sont actives ? | DONNEES | AMBIGU | donnees | 0.98 | 215 ms | **non** | — |
| D14 | Montre-moi les demandes de module en attente | DONNEES | DONNEES | donnees | 0.99 | 232 ms | oui | — |
| D15 | Quel fournisseur IA a une clé invalide ? | DONNEES | DONNEES | donnees | 1.00 | 216 ms | oui | — |
| D16 | Combien de tokens a consommé la fonction Insights en septembre ? | DONNEES | DONNEES | donnees | 1.00 | 250 ms | oui | — |
| D17 | Qui a modifié le plafond budgétaire en dernier ? | DONNEES | DONNEES | donnees | 0.99 | 220 ms | oui | — |
| D18 | Quels sont les droits de Karim Benali ? | DONNEES | DONNEES | donnees | 1.00 | 229 ms | oui | — |
| D19 | Le serveur SMTP est-il configuré ? | DONNEES | DONNEES | donnees | 1.00 | 227 ms | oui | — |
| D20 | Combien de sessions sont ouvertes actuellement ? | DONNEES | DONNEES | donnees | 1.00 | 337 ms | oui | — |
| P01 | Pourquoi mes notifications n'apparaissent pas dans « À traiter » ? | AMBIGU | AMBIGU | mixte | 0.58 | 235 ms | oui | p3 : AMBIGU (0.66) |
| P02 | La clé Google est invalide, comment je la remplace et quelles fonctions sont touchées ? | AMBIGU | USAGE | usage | 0.70 | 222 ms | **non** | p2 : USAGE (0.81) ; p3 : USAGE (0.75) |
| P03 | Et le budget ? | AMBIGU | AMBIGU | mixte | 0.42 | 212 ms | oui | — |
| P04 | Quelle est la capitale de l'Australie ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 263 ms | oui | — |
| P05 | Peux-tu m'écrire un poème sur l'automne ? | HORS_SUJET | HORS_SUJET | hors_sujet | 1.00 | 247 ms | oui | — |
| P06 | invitations ? | AMBIGU | AMBIGU | mixte | 0.50 | 223 ms | oui | p3 : AMBIGU (0.43) |
| P07 | coment on fai pour suspendre un conte | USAGE | USAGE | usage | 0.99 | 228 ms | oui | — |
| P08 | combein de notifs en echec cete semaine | DONNEES | DONNEES | donnees | 1.00 | 233 ms | oui | — |
| P09 | Et pour le mois dernier ? *(suite de : « Combien avons-nous dépensé en IA ce mois-ci ? »)* | DONNEES | DONNEES | donnees | 1.00 | 258 ms | oui | — |
| P10 | Et pour un administrateur ? *(suite de : « Comment inviter un nouvel utilisateur sur un projet ? »)* | USAGE | USAGE | usage | 0.97 | 229 ms | oui | — |

## Analyse des erreurs et améliorations

### Méthode

- Chaque question du jeu de test a reçu son type attendu et sa justification **avant** le premier appel à l'API.
- Chaque version des consignes a été soumise **3 fois** au modèle Jev (TypeSafe, `jev-latest`) via la carte « JEV » du Registre, sur la base réelle de la plateforme.
- Les exemples ajoutés aux consignes des versions 2 et 3 sont volontairement **différents** des questions du jeu de test, pour ne pas fausser la mesure.

### Version 1 : consignes courtes en français

Taux sur les questions non ambiguës : **97,8 %**. L'objectif de 95 % est atteint, mais trois défauts apparaissent.

1. **D04 « Qui est PMO sur le projet RISE ? » est instable.** Le modèle hésite entre usage et données : 0,55 USAGE, puis 0,43 et 0,30, classé AMBIGU. La même hésitation, à la limite du seuil, touche D06 (« Quel est le modèle principal… », 0,56) et D13 (« Quelles règles… sont actives ? », 0,71).
   - *Cause probable* : une question sur la **configuration actuelle** ressemble à une question de fonctionnement. Les consignes n'énonçaient pas le critère qui départage les deux : la réponse dépend-elle des enregistrements actuels ?
2. **Les questions mixtes P01 et P02 sont classées USAGE avec confiance** (0,90 et 1,00).
   - *Cause probable* : l'option « mixte » était décrite trop brièvement, alors que « usage » mentionnait « quelles règles s'appliquent », ce qui attirait les questions en « pourquoi ».
3. **Cause transversale** : Jev est entraîné surtout en anglais. D'après la documentation TypeSafe, sa précision est moindre dans les autres langues, or les consignes étaient en français.

### Version 2 : consignes en anglais, structurées, critère discriminant explicite (**en service**)

Modifications :
- consignes et descriptions en anglais ; les questions restent posées en français ;
- chaque option décrit ce qu'elle couvre, ce qu'elle exclut (« not_for ») et donne des exemples ;
- la question posée au modèle nomme le critère : expliquer le fonctionnement, lire les enregistrements actuels, les deux, ou rien.

Résultats :
- **100 %** sur les questions non ambiguës ;
- 98 % au global ;
- **aucune question instable** sur les 3 passages ;
- DONNÉES passe de 95 % à 100 % : D04, D06 et D13 sont désormais classées DONNÉES de façon stable ;
- P01 est désormais reconnue comme mixte.

**Erreur restante : P02** (« La clé Google est invalide, comment je la remplace et quelles fonctions sont touchées ? ») est classée USAGE, avec une confiance de 0,66 à 0,78.
- *Cause* : la partie « comment je la remplace » domine ; la seconde demande (« quelles fonctions ») est secondaire dans la phrase.
- *Effet* : la réponse est traitée comme une question d'usage, sans lecture des données. Les consignes d'usage demandent alors à Jev de signaler que la partie « quelles fonctions » dépend des données actuelles et de proposer de la poser séparément. La perte est donc limitée.

### Version 3 : v2 + deux questions oui/non atomiques (**écartée**)

- *Idée* : la documentation TypeSafe recommande de décomposer les questions composites.
  - Deux questions oui/non ont été ajoutées dans le même appel : « demande-t-elle comment faire ? » et « demande-t-elle des données actuelles ? ».
  - Si les deux dépassaient 0,6, la question était traitée comme mixte.
- *Résultat* : 95,7 % sur les questions non ambiguës, en **baisse**. DONNÉES tombe à 90 %.
- *Cause* :
  - la question « fonctionnement » répond oui aussi pour des questions de configuration (D06 : 0,86 ; D13 : 0,89), qui deviennent à tort des mixtes ;
  - P02 n'est pas rattrapée pour autant (données : 0,29).
- *Décision* : la v3 reste définie dans le code, pour que le rapport soit reproductible, mais n'est pas utilisée.

### Temps de réponse

- Environ **250 ms** en moyenne, 240 ms en médiane, 630 ms au maximum, identique pour les trois versions.
- Ajouter des questions dans un même appel ne change pas le temps de réponse, comme l'annonce TypeSafe.
- Aucun repli (erreur, délai dépassé, réponse illisible) sur les 450 appels.

### Comportements retenus dans Jev

| Type | Traitement |
|---|---|
| USAGE | Réponse sur le fonctionnement, **sans lecture des données**. La recherche dans le guide utilisateur (RAG) sera branchée à l'étape suivante. |
| DONNÉES | Interrogation des tables de la Console (requête en lecture seule), avec une consigne qui l'oriente vers la requête. |
| AMBIGU (mixte, question vague, confiance < 0,5) | **Les deux traitements** : Jev peut expliquer et lire les données. Pour une question très vague (« invitations ? »), la réponse peut demander une précision. |
| HORS_SUJET | Réponse polie qui rappelle le périmètre de Jev, sans appel au modèle de rédaction. |
| Erreur de l'API (carte absente, désactivée ou sans clé, délai dépassé, erreur HTTP, réponse illisible) | Repli sur **les deux traitements** (AMBIGU), motif enregistré dans `jev_classifications` et dans le journal du serveur. |

Questions de suite : les 3 dernières questions de la conversation (mémoire de Jev) accompagnent la question. Les deux questions de suite du jeu de test (P09, P10) sont classées correctement dans les trois versions.

### Pour relancer le test

```
cd backend
npm run jev:aiguillage -- --version v2 --passages 3
```

Le rapport est régénéré à chaque lancement, avec toutes les versions déjà mesurées. Pour une nouvelle version des consignes : l'ajouter dans `ROUTER_PROMPTS` (`backend/src/domain/jev-router.ts`) avec des exemples qui ne reprennent pas le jeu de test, la mesurer, puis changer `ROUTER_PROMPT_VERSION` si elle fait mieux.
