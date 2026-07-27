-- Plafond global du compte + alerte sur les réussites.
--   plafond_cents  : dépense maximale du mois, TOUS agents confondus (1000 = 10 €).
--                    0 = pas de plafond. Le budget par agent reste en plus.
--   alerte_succes  : 1 = prévenir aussi quand un agent produit un résultat.
--   alerte_ok_at   : anti-rafale propre aux réussites (les échecs ont alerte_at).
--   plafond_vu_mois: mois pour lequel l'avertissement des 80 % est déjà parti.
ALTER TABLE users ADD COLUMN plafond_cents INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE users ADD COLUMN alerte_succes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN alerte_ok_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN plafond_vu_mois TEXT;
