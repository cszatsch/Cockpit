# Spécification — Consommation et coûts (vue fusionnée)

## 1. Remplacement
Cette vue remplace « Vue générale des coûts » et « Journal consommation et coûts » dans le menu IA (une seule entrée « Consommation et coûts »). Redondances supprimées : deux sélecteurs de période, deux exports CSV, deux graphiques temporels, filtres de fonction en double.

## 2. Structure
1. **En-tête** : titre, sous-titre, période unique, Exporter en CSV.
2. **Bandeau sombre**
   - Gauche : Projection fin de mois, note (« Reste X € sous le plafond en fin de mois. » / « Dépassement projeté de X € »), Dépensé depuis le 1er, Plafond, Rythme des 7 derniers jours, même date le mois précédent, tokens du mois.
   - Droite : graphique à trois lectures — **Budget** (dépense cumulée du mois, plafond, ligne d'alerte, projection pointillée jusqu'à fin de mois), **Tokens** (barres quotidiennes, entrée au-dessus / sortie en dessous, pic annoté), **Coûts** (barres quotidiennes en €). En-tête : plage, moyenne par jour ouvré, pic.
   - Pied : tokens de la période, répartition entrée/sortie, appels, filtre actif (retirable).
3. **Tuiles fonctions** (Insights, Rapports, Guidage console, Documents, Gestion des données) : modèle(s), dépensé, % du mois, barre (dépensé plein, projection hachurée, repère d'alerte), « x % → y % fin de mois », statut, plafond (€), alerte (± 5 %, 50–100 %). Clic = filtre.
4. **Budget global** : plafond et alerte globaux + statut.
5. **Journal des appels** : date · heure, fonction, fournisseur · modèle, tokens entrée → sortie, total (barre), coût ; détail : requête, durée, calcul du coût.

## 3. Règles de calcul
- `Projection fin de mois = dépensé + rythme journalier récent × jours restants` (méthode actuelle à conserver côté serveur).
- `% courant = dépensé / plafond` ; `% projeté = projection / plafond`.
- Statut : projeté ≥ 100 % → **Dépassement projeté** (corail) ; projeté > alerte → **Alerte projetée** (ambre) ; sinon **Sous le plafond** (sarcelle).
- `Coût d'un appel = tokens entrée × prix entrée/M + tokens sortie × prix sortie/M`, au tarif en vigueur au moment de l'appel (le calcul affiché doit être exactement celui stocké).
- Moyenne « par jour ouvré » = tokens de la période / jours ouvrés (lun.–ven.).
- Le budget est toujours mensuel (mois civil) ; la période ne pilote que l'activité et le journal.

## 4. Données / API (indicatif)
- `GET /api/ai/costs/budget?month=YYYY-MM` → global + par fonction : spent, projection, cap, alertPct, rate7d, sameDayPrevMonth, tokensMonth, dailyCumul[].
- `PUT /api/ai/costs/caps/:functionId` {cap, alertPct} (`global` pour le budget global).
- `GET /api/ai/usage/daily?period=day|7d|month|30d|3m|6m&function=` → [{date, tokensIn, tokensOut, cost, calls}].
- `GET /api/ai/calls?period=…&function=…&cursor=` → journal paginé (ordre antéchronologique) : requestId, timestamp, function, provider, model, tokensIn, tokensOut, cost, durationMs, priceIn, priceOut.
- `GET /api/ai/calls/export.csv?period=…&function=…` (séparateur « ; », UTF-8 avec BOM).
- Accès administrateur uniquement. Les alertes (seuil franchi, dépassement projeté) déclenchent la notification existante.

## 5. Recette
1. Changer la période met à jour graphique Tokens/Coûts, compteurs et journal, sans modifier le budget du mois.
2. Cliquer une tuile filtre graphique, compteurs et journal ; recliquer ou « × » retire le filtre.
3. Modifier un plafond ou une alerte recalcule barre, « x % → y % » et statut, et persiste.
4. Le graphique Budget suit plafond et alerte globaux ; la note bascule en dépassement si la projection dépasse le plafond.
5. Le détail d'un appel affiche un calcul du coût dont le résultat est égal au coût de la ligne.
6. L'export CSV contient exactement les appels affichés (période + fonction).
7. Journal paginé au défilement, sans perte de performance sur 6 mois.
