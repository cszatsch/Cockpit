# Step 04d: Trademark Screening

**Progress:** Step 11 of 13 — Next: Social & Stress Tests (step-04e)
**Reads:** `brand-namer-output/03-validation.md` | **Writes:** `brand-namer-output/03-validation.md` (update)

## Purpose

A preliminary trademark risk screen on the survivors.

## Done when

- Each survivor rated Low / Medium / High trademark risk with a consistent search methodology
- Phonetically similar registered marks checked for every candidate
- INPI (FR, UE, OMPI) checked by `scripts/check-inpi.mjs`, or a manual data.inpi.fr checklist given, for any brief aimed at France or Europe
- "Not legal advice" disclaimer included and a trademark attorney recommended
- A generate-more checkpoint offered if strong candidates were killed

## Guardrails

- This is a screen, not clearance. Always recommend a trademark attorney before any filing.
- Check phonetically similar marks. "Korvus" must trigger a search for "Corvus"; trademark conflicts are about confusion, not spelling.

---

## Execution

### Trademark risk assessment

For names that have survived to this point, do a deeper trademark risk assessment:

- Search: `"[name]" trademark` or `"[name]" registered trademark`
- Search: `"[name]" site:uspto.gov` (US Patent and Trademark Office)
- Search: `"[name]" site:euipo.europa.eu` (EU Intellectual Property Office) if relevant
- Check for phonetically similar registered marks (e.g., if the name is "Korvus," search for "Corvus" too)

### Vérification INPI (France)

Lancez-la pour toute marque destinée au marché français ou européen, et par défaut quand la session se déroule en français. L'INPI couvre les marques françaises, et la même recherche ramène les marques de l'Union européenne et les marques internationales (OMPI) : c'est le registre opposable en France, qu'une recherche web `site:` ne remplace pas.

1. **Classes de Nice.** Déduisez-les du brief et annoncez-les à l'utilisateur avant la recherche (logiciel et SaaS : 9 et 42 ; conseil et services aux entreprises : 35 ; formation : 41 ; finance : 36).
2. **Script.** Un seul appel pour tous les survivants et leurs variantes phonétiques (Korvus → Corvus, Korvüs, Corvuss) :

   ```bash
   node scripts/check-inpi.mjs --classes 9,42 "Nom 1" "Corvus" "Nom 2"
   ```

   Il lit `INPI_USERNAME` et `INPI_PASSWORD` (compte gratuit de data.inpi.fr avec accès à l'API de diffusion). Ne demandez jamais ces identifiants dans la conversation et ne les écrivez dans aucun fichier : l'utilisateur les exporte lui-même dans son terminal. Relancez sans `--classes` pour les noms à risque élevé, une marque renommée étant protégée toutes classes confondues.
3. **Lecture du résultat.**
   - `aucune marque identique` : rien en expression exacte dans ces classes. Ce n'est pas une absence d'antériorité : les variantes phonétiques et les marques proches restent à juger.
   - `N marque(s)` : regardez le statut (enregistrée, en cours d'examen, expirée…), les classes et le déposant. Une marque en vigueur, identique ou phonétiquement proche, dans les mêmes classes ou des classes voisines → **High Risk**.
   - `inconnu` : l'appel a échoué. Le nom n'est **pas** vérifié ; ne le classez jamais Low Risk sur cette base.
4. **Sans compte ou si le script échoue** (code 3 ou 4, ou tous les noms « inconnu ») : dites-le clairement, puis donnez la liste des noms et variantes à saisir sur [data.inpi.fr](https://data.inpi.fr), onglet Marques, avec les classes à filtrer. Le circuit d'appel de l'API a été reconstitué d'après des sources publiques sans essai réel ; s'il ne répond plus, la recherche manuelle fait foi.

Reportez dans `03-validation.md` une colonne **INPI** par nom (résultat, marques trouvées, classes interrogées) et ajoutez `INPI` à `trademark_screening.methodology`. Le niveau de risque final combine USPTO, EUIPO et INPI : le plus élevé l'emporte.

**Categorize trademark risk:**
- **Low Risk** — no similar trademarks found in related classes
- **Medium Risk** — similar marks exist but in different industries/classes
- **High Risk** — identical or very similar marks in the same or adjacent industry

Important: This is a preliminary screen, not legal advice. Always recommend the user consult a trademark attorney before finalizing any name for registration.

### Checkpoint: generate more?

After trademark results, if any strong candidates were killed, ask: "Trademark screening eliminated [names]. Want to continue to social handle checks with the survivors, or generate more options first?" Same loop-back options as the 4b checkpoint. Only run 4a+4b+4d on new names (check the validation log).

---

## Menu

- **[G]** Generate more — loop back for more options (run 4a+4b+4d on new names only)
- **[C]** Continue — proceed to Social & Stress Tests (Step 12 of 13)

**My recommendation:** If your strongest candidates survived trademark screening with Low Risk ratings, proceed with [C]. If trademark screening killed favorites, use [G] to generate replacements before moving on — it's cheaper to generate now than to restart later.

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [G]: Write `return_to: "04d menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02c-riffing.md` (or `steps/step-02a-generation.md` for fresh generation). Its continue handler brings you back here; run 4a, 4b and 4d on the new names only (skip names already in the validation log), then re-display this menu.
IF [C]: Update `03-validation.md` frontmatter `stepsCompleted`, load next step (`steps/step-04e-social.md`).
