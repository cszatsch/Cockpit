# Registre des cartes API — spécification

Page de la Console d'administration (domaine **Plateforme**) qui recense les services externes appelés par les widgets : endpoint, clé, quota, santé, échéance de la clé.

## 1. Fichiers

| Fichier | Rôle |
|---|---|
| `Sidebar Console.dc.html` | Sidebar existante + entrée `apis` « Registre des cartes API » dans Plateforme (entre Modules et Notifications). |
| `Registre API.dc.html` | Page centrale : tableau + panneau détail / test / remplacement de clé / création. |
| `support.js` | Runtime des composants, à placer à côté des deux fichiers. |

## 2. Sidebar

- Nouvel identifiant de page : `apis`. `onNavigate('apis')` doit afficher `Registre API.dc.html`.
- Signal : `signals.apis = { dot: 'err' }` si au moins une carte est en erreur ou a une clé expirée ; `{ dot: 'warn' }` si une clé expire dans ≤ 30 j ou un quota ≥ 85 % ; sinon absent.
- Rien d'autre ne change (cloche, Cockpit, modes full / rail / mob identiques).

## 3. Modèle de données

```ts
type ApiCard = {
  id: string;
  name: string;              // « OpenWeather »
  category: 'Météo'|'Trafic'|'Actualités'|'Environnement'|'Mobilité'|'Calendrier'|'Finance'|'Autre';
  endpoint: string;          // URL https complète
  keyLast4: string | null;   // null = API sans clé
  keyExpiresAt: string | null; // 'YYYY-MM-DD'
  enabled: boolean;
  status: 'ok' | 'warn' | 'err'; // calculé côté serveur par le dernier contrôle
  statusNote?: string;       // « Clé refusée · 401 »
  latencyMs: number | null;  // dernier appel réussi
  latency24h: (number|null)[]; // 24 valeurs horaires, null = échec
  quotaUsed: number | null;  // appels du jour
  quotaLimit: number | null; // null = sans quota
  widgets: string[];         // noms des widgets qui consomment la carte
  lastTest: { code: number; ms: number | null; at: string; body: string } | null; // body tronqué à 2 Ko
};
```

Table `api_cards` : colonnes ci-dessus + `key_encrypted` (AES-256-GCM, clé maître en variable d'environnement / KMS), `created_at`, `updated_at`, `updated_by`. Table `api_card_calls` (horodatage, card_id, code, ms) pour latence et quota.

**Règle absolue : la clé en clair ne quitte jamais le serveur.** Aucune route ne la renvoie. Les widgets passent par le proxy serveur (§5).

## 4. Routes (admin uniquement)

| Méthode | Route | Corps / retour |
|---|---|---|
| GET | `/api/admin/api-cards` | `ApiCard[]` |
| POST | `/api/admin/api-cards` | `{ name, category, endpoint, key?, keyExpiresAt?, quotaLimit? }` → `ApiCard` |
| PATCH | `/api/admin/api-cards/:id` | `{ enabled }` ou champs éditables → `ApiCard` |
| PUT | `/api/admin/api-cards/:id/key` | `{ key, keyExpiresAt? }` → `ApiCard` (rotation) |
| POST | `/api/admin/api-cards/:id/test` | → `{ code, ms, body }` ; appel réel côté serveur, timeout 8 s |
| DELETE | `/api/admin/api-cards/:id` | refusé (409) si `widgets.length > 0` |

Validation : `name` 1–60 car. ; `endpoint` doit commencer par `https://`, hôte non privé (bloquer localhost, 10.x, 172.16–31.x, 192.168.x, 169.254.x — protection SSRF) ; `key` ≥ 8 car. ; `quotaLimit` entier > 0.

## 5. Proxy widgets

`GET /api/widgets/proxy/:cardId?…` : le serveur ajoute la clé, applique le quota (429 au-delà), met en cache 5 min (météo, trafic : 2 min), journalise dans `api_card_calls`. Si la carte est désactivée ou en erreur, le widget reçoit 503 et affiche son mode dégradé.

## 6. Contrôle de santé

Tâche planifiée toutes les 15 min par carte active : appel de test → met à jour `status`, `statusNote`, `latencyMs`, `latency24h`, `lastTest`. Règles d'affichage (dans l'ordre) : désactivée → erreur serveur → clé expirée → clé expirant ≤ 30 j (warn) → quota ≥ 85 % (warn) → ok.

Notifications (drawer existant, catégorie Incidents) : passage en `err`, clé à J-30 / J-7 / J-1, quota ≥ 85 %.

## 7. Branchement du composant

```html
<dc-import name="Registre API" cards="{{ cards }}" on-test="{{ test }}" on-create="{{ create }}" on-rotate-key="{{ rotate }}" on-toggle="{{ toggle }}" hint-size="100%,760px"></dc-import>
```

- `cards` : résultat de GET. Sans ce prop, le composant affiche la démo.
- `onTest(id)` doit renvoyer une Promise `{ code, ms, body }`.
- `onCreate`, `onRotateKey`, `onToggle` : appeler la route puis recharger `cards`. La mise à jour locale est optimiste.
- `now` (facultatif, ISO) : date de référence pour les échéances ; par défaut la date du jour.

## 8. Audit

Tracer dans le journal d'audit : création, rotation de clé (sans la clé, seulement `keyLast4` ancien → nouveau), activation / désactivation, suppression, test manuel. Champs : `actor`, `action`, `card_id`, `at`, `ip`.

## 9. Recette

1. La sidebar affiche « Registre des cartes API » sous Plateforme, avec un point corail quand une carte est en erreur.
2. Le tableau liste toutes les cartes ; la carte en erreur est sélectionnée par défaut.
3. « Tester l'appel » affiche code, durée et réponse ; une erreur passe la ligne en corail.
4. « Remplacer la clé » : la clé saisie n'apparaît jamais en clair après enregistrement ; seuls les 4 derniers caractères.
5. Une URL en `http://` ou vers une IP privée est refusée.
6. Aucune réponse réseau de la console ne contient une clé en clair (vérifier dans l'onglet Réseau).
