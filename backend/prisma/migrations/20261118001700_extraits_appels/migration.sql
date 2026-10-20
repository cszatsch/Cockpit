-- Journal des appels : début de la question saisie et de la réponse (50 caractères), effacés après 30 jours (20/10/2026).
ALTER TABLE "UsageRecord" ADD COLUMN "promptExcerpt" TEXT,
ADD COLUMN "responseExcerpt" TEXT,
ADD COLUMN "contentState" TEXT;
