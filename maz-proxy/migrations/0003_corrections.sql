-- MAZ — 0003 · les corrections : ce que Mazen recale devient un interdit
--
-- Un interdit, c'est une erreur qu'on ne veut pas revoir. Aujourd'hui il faut
-- la remarquer soi-même, ouvrir la fiche et rédiger la phrase. Ici, chaque
-- pouce en bas laisse une trace ; quand le même motif revient trois fois,
-- l'atelier propose la ligne à ajouter, fondée sur des cas datés.

-- Le verdict porté sur un livrable. Un seul par livrable : on change d'avis,
-- on ne s'empile pas.
CREATE TABLE IF NOT EXISTS verdicts (
  livrable_id TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  poste_id    TEXT NOT NULL,
  passage_id  TEXT NOT NULL,
  consigne_ver INTEGER NOT NULL,      -- la version en vigueur au moment du verdict
  pouce       INTEGER NOT NULL,       -- 1 en haut, -1 en bas
  motif       TEXT,                   -- deux mots de Mazen : « prix inventé »
  motif_cle   TEXT,                   -- motif normalisé (minuscules, sans accents) → sert au regroupement
  traite      INTEGER NOT NULL DEFAULT 0,  -- 1 = déjà versé dans un correctif accepté
  cree_at     INTEGER NOT NULL,
  seq         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verdicts_poste ON verdicts(poste_id, pouce, traite);
CREATE INDEX IF NOT EXISTS idx_verdicts_seq   ON verdicts(user_id, seq);

-- Un correctif de consigne proposé par l'atelier à partir de N recalages
-- concordants. Il n'est JAMAIS appliqué tout seul : il attend une décision,
-- comme une écriture attend une signature.
CREATE TABLE IF NOT EXISTS correctifs (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  poste_id  TEXT NOT NULL,
  bloc      TEXT NOT NULL,            -- role | methode | interdits | format
  action    TEXT NOT NULL,            -- ajouter | remplacer
  texte     TEXT NOT NULL,            -- la ligne proposée
  remplace  TEXT,                     -- la ligne visée si action='remplacer'
  motif     TEXT NOT NULL,            -- le motif commun aux recalages
  preuves   TEXT NOT NULL,            -- JSON des livrable_id qui le fondent
  statut    TEXT NOT NULL DEFAULT 'attente',  -- attente | accepte | refuse
  cree_at   INTEGER NOT NULL,
  decide_at INTEGER,
  seq       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_correctifs_poste ON correctifs(poste_id, statut);
CREATE INDEX IF NOT EXISTS idx_correctifs_seq   ON correctifs(user_id, seq);
