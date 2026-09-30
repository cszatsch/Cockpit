-- « Effacer toutes les notifications » du tiroir de la Console (décision du 30/09/2026) : une notification effacée
-- reste masquée tant que sa cause dure ; elle réapparaît si la cause disparaît puis revient, ou si elle s'aggrave.
ALTER TABLE "Notification" ADD COLUMN "clearedAt" TIMESTAMP(3);
