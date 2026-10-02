# Spécification — Fournisseurs et modèles

## 1. Structure de la vue
1. **Fournisseurs** (bandeau sombre) : nom, état de la clé (Connecté / Test en cours / Clé invalide), clé masquée (préfixe + 4 derniers caractères), actions Tester et Remplacer la clé. En-tête : nombre de connectés, nombre de clés invalides, Tester toutes les clés, Ajouter un fournisseur.
2. **Affectation des modèles** : une ligne par fonction (Insights, Gestion des données, Rapports, Guidage console / Cockpit) puis Documents en 3 étapes (Vectorisation → Reclassement → Synthèse). Colonnes : Fonction (état + volume 30 j), Principal, Secours (+ coût si relais), Coût mensuel estimé (+ part du total). Rapports : jauge Sortie maximale (sortie requise ≈ 38 000 vs max output tokens P/S). Pied : légende, note d'estimation, total mensuel.
3. **Modèles** : catalogue triable/filtrable — Modèle (type, ancienneté, description), Fournisseur, Entrée, Sortie (€ / M tokens), Utilisé par, Actif, Modifier.

## 2. Règles
- **Compatibilité** : fonctions Cockpit et Synthèse → LLM ; Vectorisation → Embedding ; Reclassement → Reranking. Seuls les modèles actifs sont proposés ; le principal et le secours d'une même fonction sont distincts.
- **Coût estimé** : `coût = volume_fonction × (prix_entrée + prix_sortie)`, volume réel des 30 derniers jours. Le coût affiché d'une fonction est celui du modèle qui répond (principal, ou secours s'il est en service ; 0 si à l'arrêt).
- **États de route** : principal OK → *Opérationnel* ; clé du principal invalide et secours OK → *Secours en service* ; les deux coupés → *À l'arrêt*. Documents : une étape à l'arrêt suspend les suivantes (*Suspendu en amont*). Vectorisation n'a pas de secours (revectorisation nécessaire).
- **Ancienneté** (date de sortie) : < 12 mois récent ; 12–23 mois à surveiller ; ≥ 24 mois ancien. Le catalogue n'affiche le badge qu'à partir de 12 mois.
- **Désactivation / suppression** d'un modèle affecté : refusée, avec la liste des affectations à modifier.
- **Clés** : jamais réaffichées en clair ; testées à l'enregistrement ; l'ancienne clé cesse d'être utilisée dès le remplacement.

## 3. Formulaire modèle
Type (LLM / Embedding / Reranking), Fournisseur, Nom*, Description, Identifiant chez le fournisseur*, Longueur de contexte (facultatif), Date de sortie (badge d'ancienneté), Max output tokens (LLM), Tarification Entrée* / Sortie* (LLM). Aperçu en direct : fonctions proposées et coût par fonction, coût total sur le volume actuel, nombre de modèles du même type pouvant servir de secours. Supprimer (confirmation en 2 temps), Annuler, Enregistrer / Ajouter.

## 4. API attendues (indicatif)
- `GET /api/ai/providers` · `POST /api/ai/providers` {name, apiKey} · `PUT /api/ai/providers/:id/key` {apiKey} · `POST /api/ai/providers/:id/test` · `POST /api/ai/providers/test`
- `GET /api/ai/models` · `POST /api/ai/models` · `PATCH /api/ai/models/:id` · `DELETE /api/ai/models/:id` (409 si affecté)
- `GET /api/ai/assignments` · `PUT /api/ai/assignments/:functionId` {primary, fallback} · `PUT /api/ai/assignments/vectorisation/dimensions`
- `GET /api/ai/usage?window=30d` → volume par fonction pour les estimations.
Accès réservé aux administrateurs. Clés chiffrées au repos.
