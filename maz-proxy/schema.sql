-- MAZ — schéma D1 (comptes + sync + usage)
-- Sécurité : les codes d'accès ne sont JAMAIS stockés en clair — uniquement leur SHA-256.
-- (Codes générés aléatoirement à ~80 bits d'entropie → le hash simple suffit, pas de rainbow table possible.)

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,           -- uuid
  code_hash  TEXT UNIQUE NOT NULL,       -- sha256(code d'accès)
  name       TEXT NOT NULL,              -- nom d'affichage (« Sarah », « Client Dupont »)
  team       TEXT,                       -- espace/équipe (préparé pour plus tard, nullable)
  disabled   INTEGER NOT NULL DEFAULT 0, -- 1 = accès révoqué (le code ne marche plus)
  created_at INTEGER NOT NULL,
  last_seen  INTEGER
);

CREATE TABLE IF NOT EXISTS convos (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,              -- id de la conversation côté app
  data       TEXT NOT NULL,              -- JSON complet de la conversation (médias = réfs, jamais de blobs)
  updated_at INTEGER NOT NULL,           -- horloge du client (c.ts) — last-write-wins
  deleted    INTEGER NOT NULL DEFAULT 0, -- tombstone (suppression propagée entre appareils)
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_convos_user ON convos(user_id, updated_at);

-- compteur de consommation par utilisateur et par jour (prêt pour la facturation)
CREATE TABLE IF NOT EXISTS usage (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,                -- 'YYYY-MM-DD'
  requests INTEGER NOT NULL DEFAULT 0,   -- compté côté serveur (fiable)
  tokens   INTEGER NOT NULL DEFAULT 0,   -- rapporté par l'app (indicatif)
  cost     REAL    NOT NULL DEFAULT 0,   -- rapporté par l'app (indicatif)
  PRIMARY KEY (user_id, day)
);
