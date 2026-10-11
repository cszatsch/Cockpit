-- Marque « Cockpit » (12/10/2026) : plus aucune mention de « RISE » dans le texte des skills (préremplissage d'un projet,
-- skills saisies dans la Console). Remplacements ciblés : le reste du texte, modifié ou non par l'administrateur, est gardé.
UPDATE "Skill" SET "t" = replace(replace(replace(replace(replace("t", 'Les exemples viennent du projet RISE (programme ERP d’AMC Corp).', 'Les exemples viennent d’un projet de démonstration (programme ERP d’AMC Corp).'), 'Directeur de programme RISE', 'Directeur de programme'), 'code RISE · « RISE — next level »', 'code NXL · « Next level »'), 'Exemple RISE', 'Exemple'), 'RISE Cockpit', 'Cockpit')
WHERE "t" LIKE '%RISE%';
