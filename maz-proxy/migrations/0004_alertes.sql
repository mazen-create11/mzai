-- Alertes hors de l'app : un agent qui casse la nuit ne doit plus attendre
-- qu'on ouvre l'onglet. Deux canaux au choix, aucun obligatoire.
--   alerte_email   : adresse à prévenir (envoi via Resend si RESEND_KEY est posée)
--   alerte_webhook : URL POST (Discord, Slack, Make, Zapier — marche sans clé)
--   alerte_at      : horodatage du dernier envoi, sert d'anti-rafale par compte
ALTER TABLE users ADD COLUMN alerte_email TEXT;
ALTER TABLE users ADD COLUMN alerte_webhook TEXT;
ALTER TABLE users ADD COLUMN alerte_at INTEGER NOT NULL DEFAULT 0;
