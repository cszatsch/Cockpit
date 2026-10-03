---
name: designer-rapports
description: Concevoir ou retoucher le design des rapports PowerPoint générés par RISE (Créer un template, Comités et rapports) — système de design, planches (Gantt, planning en tableau, baromètre), tableaux, indicateurs — avec la boucle de contrôle visuel dans PowerPoint. À utiliser pour toute évolution du contenu dessiné des rapports.
---

# Designer des rapports RISE

Le rapport doit offrir une **lecture immédiate**. Chaque élément affiché porte une information essentielle ; rien
d'autre. Exigence du commanditaire (03/10/2026) : design ultra premium, aucune surcharge visuelle, finesse des
finitions. Les cinq principes : innovant, utile, esthétique, compréhensible, soigné jusque dans les moindres détails.

## Où vit le design

- `backend/src/domain/report-design.ts` : **jetons** (`designTokens` : encre, texte secondaire, filets, surface,
  accent, états ok / watch / risk), **échelle typographique** (`typeScale` : label, small, body, lead, stat, hero),
  frise (`timeScale`, `timeRatio`), formats français (`frNum`, `frShortDate`). Aucune couleur ni taille en dur ailleurs.
- `backend/src/core/report-draw.ts` : dessin en formes natives (`Draw` : `sp`, `text`, `line`, `pill`, `group`,
  `label`) et planches : `drawGantt`, `drawPlanTable` (+ `foldPlan`), `drawBarometer` (+ `barometerLayout`),
  `tableHeaderRow` / `tableRow`, `kpiCards`, `synthesisParas`.
- `backend/src/core/report-template.ts` : composition (`composeTemplate`, jetons au manifeste `manifest.design`,
  polices réellement employées par la page modèle) et publication (`fillTemplate` : chaque planche est un groupe
  `rise:cNN.board` redessiné dans le même cadre).
- `backend/src/cockpit/committees/report-template.service.ts` : données des planches (`GanttData`, `BarometerData`).

## Règles

1. **Hiérarchie** : libellé en petites capitales espacées (`d.label`) → valeur (`stat` / `hero`, police des titres) →
   contexte en `small` / `muted`. Un seul niveau d'emphase par bloc.
2. **Couleur = sens** : accent pour « ce qui compte maintenant » (phase en cours, valeur clé) ; vert / ambre / rouge
   uniquement pour un état ; gris pour le passé. Jamais de couleur décorative.
3. **Filets fins** (0,5 à 0,75 pt, `hairline`), pas de cadres ni d'ombres ; un trait d'accent court (0,3 po) signe les
   cartes d'indicateurs et le bandeau du Gantt.
4. **Chiffres** alignés à droite, une décimale constante dans une colonne, écarts « ▲ +0,8 » / « ▼ -1,5 » / « = stable ».
5. **Texte** : jamais de débordement — tronquer avec « … » ou regrouper (« 4 sous-phases terminées », « … et 4 autres
   lignes »). Prévoir ~25 % de marge pour les polices larges (Poppins, Montserrat).
6. **Planning** : Gantt jusqu'à `GANTT_MAX_ROWS` (25) lignes, sinon tableau ; phase en cours mise en avant, repère du
   jour, avancement dans la barre, retard en rouge, prochain jalon nommé dans le bandeau.
7. **Honnêteté des graphiques** : échelle fixe 0–10 pour les scores sur 10 ; pas d'axe tronqué sans repère.
8. Toute nouvelle constante se consigne dans `docs/DECISIONS.md` avec son nom.

## Boucle de contrôle visuel (obligatoire)

1. Générer un rapport depuis un template réel : script temporaire `backend/scripts-tmp-gen.ts` (à supprimer, jamais
   commité) qui ouvre `NestFactory.createApplicationContext(AppModule)`, résout la portée (`AccessService.scope`) et
   appelle `ReportTemplateService.build(scope, draft)`, avec `OFFLINE=true` pour ne pas solliciter l'IA.
2. Rendre chaque diapositive en PNG avec PowerPoint (COM, PowerShell) :
   `$ppt = New-Object -ComObject PowerPoint.Application; $p = $ppt.Presentations.Open($f, -1, 0, 0); $s.Export($png, 'PNG', 1920, 1080)`.
3. Regarder chaque page à pleine résolution : chevauchements, retours à la ligne involontaires, vides inutiles,
   alignements, cohérence des polices (celle des pages modèles, pas celle du thème), contraste.
4. Corriger, régénérer, re-rendre jusqu'à ce qu'aucun défaut ne subsiste. Tester aussi un cas dense (sous-phases,
   > 25 lignes) et un cas vide.
5. Ajouter ou ajuster les tests unitaires de `test/unit/report-template.spec.ts` (« Rapport — système de design »).
