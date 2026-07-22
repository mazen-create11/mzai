-- MAZ — 0001 · socle historique (comptes, conversations, consommation)
-- Régénéré le 22/07/2026 depuis la base RÉELLE (`wrangler d1 execute maz-db --remote --command ".schema"`),
-- et non depuis l'ancien schema.sql qui avait divergé : `is_admin` y manquait, ajoutée en son temps par ALTER.
-- Le piège que ça referme : sans cette colonne, POST /admin/user réussit quand même (il ne l'insère pas),
-- on croit la base saine, puis le premier /auth/verify lève « no such column » et TOUTES les routes
-- authentifiées tombent en 500 — proxy compris.
-- ⚠️ Toujours appliquer avec --remote : sans ce drapeau la commande « réussit » sur la base locale, à vide.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,           -- uuid
  code_hash  TEXT UNIQUE NOT NULL,       -- sha256(code d'accès) — jamais le code en clair
  name       TEXT NOT NULL,
  team       TEXT,
  disabled   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER,
  is_admin   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS convos (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,              -- JSON de la conversation (réfs média, jamais de blob)
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0, -- tombstone
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_convos_user ON convos(user_id, updated_at);

CREATE TABLE IF NOT EXISTS usage (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,                -- 'YYYY-MM-DD'
  requests INTEGER NOT NULL DEFAULT 0,   -- compté serveur
  tokens   INTEGER NOT NULL DEFAULT 0,
  cost     REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
