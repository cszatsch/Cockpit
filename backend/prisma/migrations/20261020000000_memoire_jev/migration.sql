-- Mémoire conversationnelle du Jev de la Console (30/09/2026) : conversations et messages par administrateur.
-- CreateTable
CREATE TABLE "jev_conversations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "summary" TEXT,
    "summarized_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jev_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jev_messages" (
    "seq" SERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jev_messages_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "jev_conversations_account_id_updated_at_idx" ON "jev_conversations"("account_id", "updated_at");

-- CreateIndex
CREATE INDEX "jev_messages_conversation_id_seq_idx" ON "jev_messages"("conversation_id", "seq");

-- AddForeignKey
ALTER TABLE "jev_conversations" ADD CONSTRAINT "jev_conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jev_messages" ADD CONSTRAINT "jev_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "jev_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dictionnaire des données de la Console : vue de l'objet « Info projet » (viewSql(), src/domain/jev-dictionnaire.ts).
CREATE VIEW jev.infos_projet AS
SELECT
  t.project_id || ':' || t.ordre_rubrique || ':' || t.ordre AS id,
  t.project_id AS projet_id,
  t.rubrique AS rubrique,
  t.ordre_rubrique AS ordre_rubrique,
  t.ordre AS ordre,
  t.libelle AS libelle,
  t.valeur AS valeur
FROM (SELECT b."projectId" AS project_id, r.rubrique, r.ordre_rubrique, e.ord AS ordre,
      CASE WHEN r.kv THEN e.el->>0 END AS libelle, CASE WHEN r.kv THEN e.el->>1 ELSE e.el#>>'{}' END AS valeur
    FROM "ContentBlock" b
    CROSS JOIN LATERAL (VALUES ('Le client', 1, 'identity', true), ('Marques du groupe', 2, 'brands', false), ('Programme en une phrase', 3, 'pitch', false), ('Enjeux stratégiques', 4, 'stakes', false),
      ('Périmètre fonctionnel', 5, 'scope', true), ('Périmètre applicatif', 6, 'systems', true), ('Périmètre géographique', 7, 'geo', false), ('Périmètre juridique', 8, 'legal', false)) r(rubrique, ordre_rubrique, cle, kv)
    CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(b.data::jsonb -> r.cle) WHEN 'array' THEN b.data::jsonb -> r.cle WHEN 'string' THEN jsonb_build_array(b.data::jsonb -> r.cle) ELSE '[]'::jsonb END) WITH ORDINALITY e(el, ord)
    WHERE b.key = 'referential' AND coalesce(CASE WHEN r.kv THEN e.el->>1 ELSE e.el#>>'{}' END, '') <> '') t;
GRANT SELECT ON jev.infos_projet TO jev_lecteur;
