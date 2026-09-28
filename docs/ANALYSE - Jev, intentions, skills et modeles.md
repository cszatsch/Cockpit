# Analyse : Jev relie-t-il la demande, la skill et le modèle ? (28/09/2026)

Réponse courte : **non**. Aucun maillon de la chaîne « demande → intention → skill → modèle → données → réponse » n'est réellement piloté par la demande de l'utilisateur. La plupart des demandes sont soit reconnues par mots-clés, soit envoyées à une passerelle LLM bouchon qui renvoie un écho du texte.

## 1. Chaîne actuelle, maillon par maillon

### 1.1 Demande → intention
- **Cockpit** (`backend/src/cockpit/assistant/assistant.controller.ts`)
  - Des expressions régulières reconnaissent trois opérations sur quatre objets :
    - créer une action (« crée une action : … ») ;
    - reporter une échéance (« reporte … au 12/03/2027 ») ;
    - changer un statut (terminé, en cours, bloqué, mitigation, rouvert) d'un risque, d'un problème, d'une action ou d'une décision.
  - Les codes cités (A-31, R05, P01, D-007, J06) deviennent des « sources ».
  - Aucune autre intention n'est reconnue.
- **Console, dans le navigateur** (`frontends/Console Admin.dc.html`, `jevReply`)
  - Un moteur d'environ 25 familles de mots-clés répond d'abord, localement : clés et fournisseurs, coûts, comptes, audit, snapshots, modules, notifications, droits, sessions…
  - Le serveur n'est appelé que si ce moteur répond « Je n'ai pas compris ».
- **Console, côté serveur** (`backend/src/admin/console.controller.ts`, `jev`)
  - Cinq branches par mots-clés : refus d'afficher une clé, relance, suspension, budget, snapshot.
  - Tout le reste va au LLM.
- **Conséquence** : l'intention n'est jamais déterminée par un modèle. Synonymes, fautes, anglais, demandes composées ou formulations imprévues ne sont pas reconnus.

### 1.2 Intention → skill
- Aucune sélection. `JevPromptService` assemble à chaque réponse le prompt de base, le Persona et **toutes** les skills actives, dans l'ordre de la liste.
- Le choix de la bonne skill est laissé au modèle, grâce à la section « Quand appliquer » de chaque skill.
- Coût : environ 6 000 tokens de skills à chaque message si les cinq nouvelles sont actives, y compris pour « bonjour ».

### 1.3 Intention → modèle
- Le modèle dépend de la **fonction IA** appelée, et la fonction est fixée par l'appelant, pas par la demande :

| Appelant | Fonction appelée | Remarque |
|---|---|---|
| Jev du Cockpit | `crud` si une expression régulière a produit une proposition, sinon `insights` | |
| Jev de la Console | toujours `insights` | |
| Dépôt d'un document | chaîne Documents (`doc_vec` → `doc_rrk` → `doc_syn`) | au moment du dépôt seulement |
| Règles de notification | modèle choisi règle par règle | |
| Fonction `rapports` (Génération de rapports) | **jamais appelée** | |

### 1.4 Données envoyées au modèle
- Le Jev du Cockpit envoie seulement `[espace/onglet] texte` : aucune donnée du projet, même pas le contenu des objets cités.
- Les pièces jointes sont stockées mais leur contenu n'est pas transmis.
- Le Jev de la Console n'envoie pas non plus de données (la page ouverte seulement).

### 1.5 Réponse du modèle
- La passerelle est un **bouchon** (`LlmService.generate`) : elle renvoie « Synthèse (réf. …) : » suivi des premiers mots de la demande.
- Le prompt système (Persona et skills) n'est pas utilisé pour produire le texte ; il sert seulement à compter les tokens consommés.
- Les skills et le Persona n'ont donc **aucun effet** sur les réponses aujourd'hui.

## 2. Couverture des demandes

Légende : ✅ couvert · 🟡 partiel · ❌ non couvert.

Colonnes :
- **Intention reconnue** : la demande est identifiée comme telle.
- **Données disponibles** : les données nécessaires parviennent à Jev.
- **Skill** : la skill qui devrait guider la réponse.
- **Fonction / modèle** : la fonction IA appelée, et celle qu'il faudrait.
- **Réponse utile** : la réponse obtenue sert réellement l'utilisateur.

### 2.1 Cockpit

| Demande type | Intention reconnue | Données disponibles | Skill | Fonction / modèle | Réponse utile |
|---|---|---|---|---|---|
| « Où en est le projet ? », « qu'est-ce qui bloque ? » | ❌ | ❌ | Analyser le projet | insights | ❌ écho |
| « Sommes-nous prêts pour le Go / No-Go ? » | ❌ | ❌ | Analyser le projet | insights | ❌ |
| « Quels risques critiques sans plan ? » | ❌ | ❌ (l'anomalie existe dans Aujourd'hui › Écarts) | Analyser le projet | insights | ❌ |
| « Explique R05 » (code cité) | 🟡 code reconnu | ❌ contenu non transmis | Analyser le projet | insights | ❌ |
| « Mes tâches », « mes échéances de la semaine » | ❌ | ❌ (données dans `GET /today`) | Guider / Analyser | insights | ❌ |
| Créer une action | ✅ | ✅ | Mettre à jour | crud | ✅ proposition à valider |
| Reporter une échéance (action, risque, problème, décision) | ✅ | ✅ | Mettre à jour | crud | ✅ |
| Changer un statut | ✅ | ✅ | Mettre à jour | crud | ✅ |
| Créer un risque, un problème ou une décision | ❌ | — | Mettre à jour | insights | ❌ |
| Changer un porteur, une priorité, une criticité, un plan de mitigation | ❌ | — | Mettre à jour | insights | ❌ |
| Plusieurs modifications en une demande | ❌ | — | Mettre à jour | — | ❌ |
| Modifier un jalon, une phase ou le Référentiel | ✅ refus explicite dans le Référentiel ; ailleurs, non reconnu | — | Mettre à jour | — | 🟡 (refus voulu) |
| Rédiger un compte rendu, un ordre du jour, une relance | ❌ | ❌ | aucune (« Rédiger un livrable » supprimée) | insights | ❌ |
| Préparer un rapport ou un PowerPoint | ❌ | ❌ | Générer un rapport PowerPoint | insights (devrait être `rapports`) | ❌ ; pas d'export .pptx |
| Générer le rapport officiel d'une séance | ✅ par l'écran Comités et rapports (hors Jev) | ✅ | — | aucune (PDF sans IA) | 🟡 PDF minimal |
| « Que dit le CR du 20e COPIL sur … ? » | ❌ | ❌ aucune recherche dans les documents | aucune | devrait être la chaîne Documents | ❌ |
| Analyser un document déposé | ✅ au dépôt | 🟡 texte lu | — | chaîne Documents (bouchon) | 🟡 extraction simulée |
| Question sur une pièce jointe envoyée à Jev | ❌ | ❌ contenu non transmis | — | insights | ❌ |
| « Comment créer un template ? », « où est… ? » | ❌ | ✅ la carte des écrans est dans la skill | Guider l'utilisateur | insights | ❌ aujourd'hui ; 🟡 avec un vrai LLM |
| « Pourquoi je ne vois pas ce chantier ? » | ❌ | ❌ droits de l'utilisateur non transmis | Guider l'utilisateur | insights | ❌ |
| Question dans Comités et rapports ou Base de connaissance | ✅ | — | — | insights | 🟡 réponse d'explication fixe |

### 2.2 Console d'administration

| Demande type | Intention reconnue | Données disponibles | Skill | Fonction / modèle | Réponse utile |
|---|---|---|---|---|---|
| Afficher une clé API | ✅ refus | — | Répondre sur la Console | aucune | ✅ |
| Tester les clés, clé refusée, latence | ✅ moteur local | ✅ | idem | aucune | ✅ |
| Budget, coûts, projection | ✅ local et serveur | ✅ | idem | aucune | ✅ |
| Réduire les coûts | ✅ local | ✅ | idem | aucune | ✅ suggestion |
| Suspendre, réactiver un compte, relancer les invitations | ✅ local, avec confirmation | ✅ | idem | aucune | ✅ (actions du serveur ignorées par l'écran, mais le moteur local répond d'abord) |
| « Qui a fait … ? », journal d'audit | ✅ local | ✅ données chargées | idem | aucune | ✅ |
| Snapshots : créer, comparer, restaurer | ✅ local | ✅ | idem | aucune | ✅ |
| Modules : activer, demandes en attente | ✅ local | ✅ | idem | aucune | ✅ |
| Notifications envoyées, échecs d'envoi | ✅ local | ✅ | idem | aucune | ✅ |
| Droits d'un utilisateur, sessions | ✅ local | ✅ | idem | aucune | ✅ |
| Affectation, secours, modèles | 🟡 mots-clés généraux | ✅ | idem | aucune | 🟡 |
| « Pourquoi la Vectorisation est à l'arrêt ? » (diagnostic) | ❌ | ❌ non transmises au modèle | idem | insights | ❌ écho |
| Réindexation, dimensions d'embedding, sortie trop courte pour les rapports | ❌ | ❌ | idem | insights | ❌ |
| Accepter ou refuser une demande du tiroir de notifications | ❌ | — | idem | — | ❌ (le tiroir le fait) |
| Persona, Skills (« quelles skills sont actives ? ») | ❌ | ❌ | idem | insights | ❌ |
| Import refusé : « quelles erreurs ? » | ❌ | ❌ | idem | insights | ❌ |
| Question libre hors mots-clés | ❌ | ❌ | idem | insights | ❌ écho |

### 2.3 Bilan
- Le **Cockpit** couvre 3 intentions de modification sur 4 objets ; aucune demande d'analyse, de rédaction, de rapport, de recherche documentaire ou de guidage n'aboutit à une réponse utile.
- La **Console** répond bien aux demandes prévues par son moteur de mots-clés (gestion courante), mais pas aux diagnostics ni aux questions libres.
- Les **skills** et le **Persona** sont bien assemblés et envoyés, mais sans effet tant que la passerelle LLM est un bouchon ; même avec un vrai modèle, ils seraient inutiles pour l'analyse faute de données transmises.
- La fonction **`rapports`** et la **chaîne Documents** ne sont jamais sollicitées par une question de l'utilisateur.

## 3. Architecture cible proposée

1. **Passerelle LLM réelle**
   - Appel des fournisseurs (Anthropic, OpenAI, Mistral, Google, OpenRouter) avec la clé chiffrée existante.
   - Prompt système réellement envoyé.
   - Bascule sur le secours, et en cas de réponse tronquée (`max_tokens`).
2. **Routeur d'intention en deux temps**
   - Les expressions régulières actuelles restent en premier filet : sûres, gratuites, sans latence.
   - Puis une classification par un modèle léger, qui renvoie `{ intention, skills, fonction, objets cités, périmètre }`.
   - Intentions cibles :
     - `analyser`, `modifier`, `rediger`, `rapport`, `documents`, `guider` (Cockpit) ;
     - `administrer`, `diagnostiquer` (Console) ;
     - `hors_perimetre`.
3. **Sélection des skills**
   - N'envoyer que la ou les skills de l'intention, avec le Persona.
   - Soit un champ « intentions » sur `Skill`, soit un choix par le classifieur à partir du nom et de la section « Quand appliquer ».
   - Gain attendu : environ 6 000 → 1 500 tokens par message.
4. **Correspondance intention → fonction IA** (donc modèle affecté et secours) :

| Intention | Fonction IA |
|---|---|
| analyser, guider, diagnostiquer, administrer | insights |
| modifier | crud |
| rediger, rapport | rapports (contrôle de sortie requise déjà en place) |
| documents | chaîne Documents : recherche vectorielle, reclassement, synthèse avec citations |

5. **Contexte de données par intention**, filtré par les droits de l'utilisateur :
   - analyser : jalons, risques, actions, décisions, anomalies, `GET /today` ;
   - guider : profil et chantiers de l'utilisateur ;
   - diagnostiquer : état des fournisseurs, affectation, consommation.
   - Transmis sous forme compacte, avec le contenu des objets cités.
6. **Outils (function calling)** pour les écritures du Cockpit
   - Créer ou modifier un risque, un problème, une action ou une décision, champ par champ.
   - Chaque appel d'outil produit une proposition `AssistantChange`, validée par l'utilisateur comme aujourd'hui.
7. **Recherche documentaire**
   - Index vectoriel (pgvector) alimenté au dépôt par `doc_vec`.
   - Route de question avec citations, qui ouvre la version exacte et le passage.
8. **Export PowerPoint** : génération `.pptx` (par exemple pptxgenjs) par la fonction `rapports`, sur les sections du template.
9. **Console**
   - Déplacer le moteur de mots-clés côté serveur, pour une seule source de vérité.
   - Brancher les actions confirmables du serveur dans l'écran.
   - Transmettre au modèle l'état utile au diagnostic.
10. **Évaluation**
    - Un jeu de 80 à 100 demandes types (celles des tableaux ci-dessus, plus des variantes : synonymes, fautes, anglais, demandes composées).
    - Pour chacune : intention, skill, fonction et action attendues.
    - Exécuté en test automatique à chaque changement du routeur ou d'une skill.
