# Analyse des temps de traitement — spécification

Console d’administration › IA › **Analyse des temps de traitement** (après « Journal consommation et coûts »). Proposition retenue : **1c Cascade**.

## 1. Fichiers
| Fichier | Rôle |
|---|---|
| `Analyse des temps de traitement.dc.html` | Écran complet (données de démonstration intégrées) |
| `Sidebar Console.dc.html` | Sidebar v3 avec l’entrée `latency` ajoutée au domaine IA |
| `support.js` | Runtime des composants, à placer à côté des `.dc.html` |

Intégration dans Console Admin : ajouter `latency: 'Analyse des temps de traitement'` dans `META` et monter l’écran quand `S.sec === 'latency'`.

## 2. Écran
- **Axe** : « Par catégorie de prompt » ou « Par modèle ». Changer d’axe réinitialise la sélection (par défaut : Base de connaissance / Claude Sonnet 5).
- **Période** : Jour · 7 jours · 1 mois · 3 mois · 6 mois. En Jour, des flèches permettent de remonter jusqu’à 182 jours ; la journée par défaut est la veille (données consolidées). Les autres périodes se terminent la veille.
- **Vignettes** : une par catégorie (6) ou par modèle. Elles affichent la médiane de bout en bout, l’étendue min – max et le nombre d’erreurs.
- **Cascade, par catégorie** : une ligne par étape, dans l’ordre d’exécution. La barre commence à la fin de l’étape précédente et sa longueur correspond à la médiane. La moustache va de début + min à début + max ; elle s’estompe à droite quand elle dépasse l’échelle. La dernière ligne, « Bout en bout », porte la médiane, le min et le max mesurés sur la durée totale de chaque prompt. Le sous-titre de chaque étape indique le modèle, ou le principal et la part des appels du secours.
- **Cascade, par modèle** : ligne « Ensemble des appels », puis une ligne par catégorie de prompt et une ligne par étape où le modèle intervient. Toutes les barres partent de 0.
- **Erreurs** : marqueur corail sur l’étape concernée, à la fois sur la barre (liseré) et sur le libellé (pastille avec le nombre, type d’erreur en infobulle). Les vignettes et le bandeau de période affichent les totaux. Sur la courbe d’évolution, chaque point en erreur est un disque corail ; « ×N » s’affiche à partir de 2 erreurs.
- **Évolution** : médiane (trait) et bande min – max. Granularité : par heure pour Jour, par jour pour 7 jours et 1 mois, par semaine pour 3 et 6 mois.
- Format des durées : `< 1 s` en ms arrondies à 10 ms, `< 10 s` en secondes avec 1 décimale, au-delà en secondes entières. Séparateur décimal : virgule.

## 3. Données attendues
### Mesure à la source (une ligne par étape exécutée)
```ts
interface StepTiming {
  requestId: string;          // identifiant du prompt
  category: 'guide_cockpit' | 'guide_console' | 'data_cockpit' | 'data_console' | 'update_cockpit' | 'kb_document';
  step: 'route' | 'vec' | 'rrk' | 'qry' | 'exe' | 'gen';
  model: string;              // id du modèle, ou 'svc' pour un traitement interne sans modèle
  role: 'primary' | 'fallback';
  startedAt: string; endedAt: string;   // horodatage serveur (ISO 8601, ms)
  error?: { type: string; message?: string };
}
```
Écrire aussi une ligne `e2e` par prompt (de la réception de la requête à l’envoi du dernier token). Le bout en bout **n’est pas** la somme des médianes par étape.

Correspondance des étapes : `route` Routage · `vec` Vectorisation (Qwen3 Embedding 8B) · `rrk` Reclassement · `qry` Formulation de la requête · `exe` Exécution (service RISE) · `gen` Génération.

### API
`GET /api/ai/latency?period=d|7|1m|3m|6m&day=YYYY-MM-DD` (`day` uniquement pour `d`)
```ts
interface LatencyReport {
  period: string; from: string; to: string;           // YYYY-MM-DD, bornes incluses
  categories: {
    category: string; count: number;                    // prompts
    e2e: { med: number; min: number; max: number };     // ms
    steps: { step: string; models: {
      model: string; role: 'primary' | 'fallback'; count: number;
      med: number; min: number; max: number;            // ms
      errors: { type: string; count: number; lastAt: string }[];
    }[] }[];                                            // dans l’ordre d’exécution
  }[];
}
```
`GET /api/ai/latency/series?period=…&day=…&axis=cat|mod&id=…` → `{ l: string; med: number; min: number; max: number; err: number }[]` (granularité décrite au §2).

Branchement : props `fetchData(period, dayOffset)` et `fetchSeries(period, dayOffset, axis, id)`. Elles renvoient les données déjà chargées, ou `null` tant que le chargement n’est pas terminé (l’écran affiche alors la démonstration). `dayOffset = 0` désigne la veille.

### Calculs serveur
- Médiane : percentile 50 exact (ou t-digest au-delà de 100 000 lignes). Min et max sont les valeurs brutes.
- Une étape en erreur garde sa durée jusqu’à l’échec. Un prompt dont une étape a échoué entre dans le bout en bout si une réponse a été servie (par exemple via le secours) ; sinon il est exclu du bout en bout et compté en erreur.
- La vue par modèle agrège les lignes `StepTiming` du modèle (médiane pondérée par le nombre d’appels côté écran ; le serveur peut renvoyer la médiane exacte).
- Purge : conserver les lignes brutes 190 jours.

## 4. Recette
1. 7 jours, Par catégorie : 6 vignettes ; « Base de connaissance » est sélectionnée et sa cascade compte 4 étapes et une ligne Bout en bout.
2. Chaque barre d’étape commence exactement à la fin de la précédente (trait pointillé).
3. Reclassement porte le liseré et la pastille corail ; l’infobulle affiche le type « Délai dépassé (5 s) ».
4. Jour : la flèche « suivant » est désactivée sur la veille ; « précédent » change la date et les valeurs.
5. Par modèle › Claude Haiku 4.5 : la section Par étape contient Routage et Génération ; la section Par catégorie liste les 6 catégories.
6. 3 mois et 6 mois : courbe par semaine (13 et 27 points), points d’erreur placés à leur semaine.
7. Aucune donnée sur la période : titre « Aucun traitement sur la période », pas d’erreur console.
