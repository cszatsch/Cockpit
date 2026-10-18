-- Quota de questions à Jev par compte et par jour civil (audit de sécurité du 18/10/2026, JEV_DAILY_QUESTIONS_MAX).
CREATE TABLE "jev_quotas" (
    "account_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "jev_quotas_pkey" PRIMARY KEY ("account_id", "day")
);
