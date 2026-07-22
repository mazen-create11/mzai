-- MAZ — 0002 · l'atelier (chantiers, ouvriers, postes, passages, contrôles, livrables)
--
-- Trois principes tenus par le schéma lui-même :
--   1. Rien n'est supprimé physiquement. `supprime=1` est un tombstone, sinon la suppression
--      faite sur le Mac ne peut pas se propager à l'iPhone.
--   2. Toute ligne porte `seq`, un compteur monotone PAR UTILISATEUR tenu par le Worker.
--      GET /delta?depuis=<seq> renvoie exactement ce qui a changé — plus de dernier-écrit-gagne,
--      plus de téléchargement complet au démarrage.
--   3. Le coût est calculé côté serveur, jamais rapporté par le navigateur : un passage tourne
--      sans onglet ouvert, il n'y a personne pour rapporter quoi que ce soit.

-- ── le compteur de synchronisation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compteurs (
  user_id TEXT PRIMARY KEY,
  seq     INTEGER NOT NULL DEFAULT 0
);

-- ── chantiers : un client, un contexte, une enveloppe ─────────────────────────
CREATE TABLE IF NOT EXISTS chantiers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  nom        TEXT NOT NULL,
  contexte   TEXT NOT NULL DEFAULT '',   -- injecté dans <chantier_contexte> à chaque passage
  library_id TEXT,                       -- bibliothèque documentaire Mistral (recherche documentaire)
  couleur    TEXT,
  cree_at    INTEGER NOT NULL,
  maj_at     INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  supprime   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chantiers_seq ON chantiers(user_id, seq);

-- ── ouvriers : QUI sait faire. Un modèle + un outillage autorisé ──────────────
CREATE TABLE IF NOT EXISTS ouvriers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  nom           TEXT NOT NULL,
  metier        TEXT NOT NULL DEFAULT '',
  modele        TEXT NOT NULL,           -- id Mistral exact (mistral-large-latest, …)
  temperature   REAL NOT NULL DEFAULT 0.3,
  outillage     TEXT NOT NULL DEFAULT '[]',  -- JSON : ["web_search","code_interpreter",…]
  agent_id      TEXT,                    -- agent Mistral distant, si outils natifs
  agent_version INTEGER,
  cree_at       INTEGER NOT NULL,
  maj_at        INTEGER NOT NULL,
  seq           INTEGER NOT NULL,
  supprime      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ouvriers_seq ON ouvriers(user_id, seq);

-- ── postes : QUOI faire. Le cœur du modèle ────────────────────────────────────
-- `cadence` vaut 'demande' par défaut : un poste qu'on lance sur le coup est un poste
-- de plein droit — il a sa consigne versionnée, son disjoncteur et son historique,
-- il attend juste qu'on appuie. La planification est une option, pas la condition d'existence.
CREATE TABLE IF NOT EXISTS postes (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  chantier_id    TEXT,
  ouvrier_id     TEXT NOT NULL,
  nom            TEXT NOT NULL,
  objectif       TEXT NOT NULL DEFAULT '',
  consigne_ver   INTEGER NOT NULL DEFAULT 1,

  cadence        TEXT NOT NULL DEFAULT 'demande',  -- demande | cron | webhook | chaine
  cron           TEXT,                             -- '0 8 * * *' si cadence='cron'
  tz             TEXT NOT NULL DEFAULT 'Europe/Paris',
  decale_s       INTEGER NOT NULL DEFAULT 0,       -- jitter déterministe : 30 postes ne frappent pas à 8h00 pile
  prochain_at    INTEGER,                          -- epoch ms du prochain passage dû
  cle_webhook    TEXT,                             -- 32 car., comparaison en temps constant

  livrable_forme TEXT NOT NULL DEFAULT 'note',     -- note | tableau | courriel | json
  destinataire   TEXT,                             -- ALLOWLIST figée : le modèle rédige, il ne choisit jamais l'adresse
  ecriture_auto  INTEGER NOT NULL DEFAULT 0,       -- 0 = toute écriture passe au contrôle. Défaut non négociable.

  budget_cents   INTEGER NOT NULL DEFAULT 300,     -- disjoncteur mensuel
  depense_cents  INTEGER NOT NULL DEFAULT 0,
  depense_mois   TEXT,                             -- 'YYYY-MM' — remet le compteur à zéro au changement de mois
  etat           TEXT NOT NULL DEFAULT 'brouillon',-- brouillon | actif | pause | disjoncte | sommeil
  sante          TEXT NOT NULL DEFAULT '',         -- 8 caractères, un par passage : O réussi, X échec, ? contrôle, . vide
  lu_le          INTEGER,

  cree_at        INTEGER NOT NULL,
  maj_at         INTEGER NOT NULL,
  seq            INTEGER NOT NULL,
  supprime       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_postes_seq ON postes(user_id, seq);
-- l'index qui porte le battement : sélectionner les postes dus coûte une lecture d'index, pas un balayage
CREATE INDEX IF NOT EXISTS idx_postes_dus ON postes(etat, prochain_at);

-- ── consignes : INSERT seulement, jamais d'UPDATE. L'historique est le produit ─
CREATE TABLE IF NOT EXISTS consignes_versions (
  poste_id  TEXT NOT NULL,
  version   INTEGER NOT NULL,
  blocs     TEXT NOT NULL,               -- JSON {role, methode, interdits, format} — 4 blocs nommés
  modele    TEXT,                        -- le modèle actif à cette version (une régression vient souvent de là)
  outillage TEXT,
  motif     TEXT,                        -- « v2 — interdit les estimations »
  cree_at   INTEGER NOT NULL,
  PRIMARY KEY (poste_id, version)
);

-- ── passages : une exécution ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passages (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  poste_id        TEXT NOT NULL,
  consigne_ver    INTEGER NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'reel',   -- reel | repetition | rejeu | banc
  declencheur     TEXT NOT NULL DEFAULT 'main',   -- main | cadence | webhook | chaine
  statut          TEXT NOT NULL DEFAULT 'encours',-- encours | attente | fini | echec | coupe
  entree          TEXT,
  conversation_id TEXT,                           -- conversation Mistral (l'historique vit chez eux)
  resume          TEXT,
  erreur          TEXT,
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  cout_cents      REAL NOT NULL DEFAULT 0,        -- calculé SERVEUR depuis usage + tarifs
  debut_at        INTEGER NOT NULL,
  fin_at          INTEGER,
  seq             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passages_poste ON passages(poste_id, debut_at DESC);
CREATE INDEX IF NOT EXISTS idx_passages_seq   ON passages(user_id, seq);

-- ── étapes : ce que le passage a fait, pas à pas ──────────────────────────────
-- `args` + `args_hash` servent deux fois : la cassette du banc d'essai (rejouer un
-- appel d'outil sans repartir sur le web) et la détection de boucle (même empreinte
-- trois fois d'affilée = l'agent tourne en rond, on coupe).
CREATE TABLE IF NOT EXISTS etapes (
  passage_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  nom        TEXT NOT NULL,
  sens       TEXT NOT NULL DEFAULT 'lecture',  -- lecture | ecriture
  statut     TEXT NOT NULL DEFAULT 'ok',       -- ok | echec | simule | attente
  essai      INTEGER NOT NULL DEFAULT 1,
  ms         INTEGER,
  args       TEXT,
  args_hash  TEXT,
  sortie     TEXT,
  plan       TEXT,                             -- en répétition : ce qui AURAIT été écrit
  PRIMARY KEY (passage_id, seq)
);

-- ── contrôles : toute écriture s'arrête ici et attend une signature ───────────
CREATE TABLE IF NOT EXISTS controles (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  passage_id   TEXT NOT NULL,
  poste_id     TEXT NOT NULL,
  outil        TEXT NOT NULL,
  tool_call_id TEXT,
  intention    TEXT NOT NULL,              -- JSON des arguments proposés
  resume       TEXT NOT NULL,              -- une phrase lisible : « Envoyer un courriel à … »
  pourquoi     TEXT,                       -- la règle de la consigne qui a déclenché
  statut       TEXT NOT NULL DEFAULT 'attente', -- attente | valide | refuse | corrige | perime
  correction   TEXT,
  perime_at    INTEGER NOT NULL,           -- ne rien décider = ne rien exécuter
  cree_at      INTEGER NOT NULL,
  decide_at    INTEGER,
  seq          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_controles_attente ON controles(user_id, statut, perime_at);
CREATE INDEX IF NOT EXISTS idx_controles_seq     ON controles(user_id, seq);

-- ── livrables : ce qui sort, et la preuve qu'on l'a lu ────────────────────────
CREATE TABLE IF NOT EXISTS livrables (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  poste_id   TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  forme      TEXT NOT NULL DEFAULT 'note',
  titre      TEXT NOT NULL,
  corps      TEXT,
  kv_cle     TEXT,                         -- gros contenu déporté en KV
  mime       TEXT,
  ouvert_at  INTEGER,                      -- dix livrables jamais ouverts → le poste s'endort
  cree_at    INTEGER NOT NULL,
  seq        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_livrables_poste ON livrables(poste_id, cree_at DESC);
CREATE INDEX IF NOT EXISTS idx_livrables_seq   ON livrables(user_id, seq);

-- ── tarifs : en base, pas en dur. Mistral les change, et un coût faux est pire ─
-- qu'un coût absent : il donne confiance à tort.
CREATE TABLE IF NOT EXISTS tarifs (
  cle      TEXT PRIMARY KEY,      -- id du modèle
  in_musd  REAL NOT NULL,         -- $ par million de jetons en entrée
  out_musd REAL NOT NULL,
  maj      INTEGER NOT NULL
);

-- Relevés sur mistral.ai/pricing/api le 22/07/2026, vérifiés deux fois à la source.
-- Contre-intuitif et pourtant exact : large est 5× moins cher que medium en sortie.
INSERT OR REPLACE INTO tarifs (cle,in_musd,out_musd,maj) VALUES
  ('mistral-large-latest',    0.50, 1.50, 1784721600000),
  ('mistral-medium-latest',   1.50, 7.50, 1784721600000),
  ('mistral-small-latest',    0.15, 0.60, 1784721600000),
  ('magistral-medium-latest', 2.00, 5.00, 1784721600000),
  ('magistral-small-latest',  0.50, 1.50, 1784721600000),
  ('devstral-medium-latest',  0.40, 2.00, 1784721600000),
  ('codestral-latest',        0.30, 0.90, 1784721600000),
  ('ministral-3b-latest',     0.10, 0.10, 1784721600000),
  ('ministral-8b-latest',     0.15, 0.15, 1784721600000),
  ('ministral-14b-latest',    0.20, 0.20, 1784721600000);
