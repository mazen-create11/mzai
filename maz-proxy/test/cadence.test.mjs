// Le lecteur de cron : ce qu'il lit, ce qu'il refuse. `prochaineCadence` est
// appelée directement ; `null` veut dire « expression refusée », et c'est ce
// `null` que les routes traduisent en « cron_invalide ».
// Aucune base ici : le calcul ne dépend que de l'expression, du fuseau et de
// l'instant de départ, fixé pour que les échéances attendues soient écrites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../atelier.js';

const TZ = 'Europe/Paris';
const utc = (jour, h, mi) => Date.UTC(2026, 10, jour, h, mi);   // novembre 2026 : Paris = UTC+1
const DEPUIS = utc(12, 10, 17);                                 // jeudi 12 novembre 2026, 11h17 à Paris
const suivant = (cron, depuis = DEPUIS) => A.prochaineCadence(cron, TZ, depuis);
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const jourA = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(ms);
/** Les `n` prochaines échéances, chacune partant de la précédente. */
const serie = (cron, n) => { const out = []; let t = DEPUIS; for (let i = 0; i < n; i++) { t = suivant(cron, t); out.push(t); } return out; };

/* ── aucune cadence existante ne devient invalide ── */

test('chaque cadence que l’application propose reste lisible', () => {
  const app = readFileSync(new URL('../../mzai-v2.html', import.meta.url), 'utf8');
  const liste = app.match(/id="atCron">\s*\$\{(\[\[[^]*?\]\])\s*\.map\(/);
  assert.ok(liste, 'la liste « À quelle heure » de la fiche n’a pas été trouvée dans l’app');
  const proposees = [...liste[1].matchAll(/\['([^']+)','[^']+'\]/g)].map((x) => x[1]);
  assert.ok(proposees.length > 0, 'aucune cadence lue dans la liste de la fiche');
  for (const cron of proposees) {
    const t = suivant(cron);
    assert.ok(t > DEPUIS, `« ${cron} » est proposée par l’app mais refusée par le serveur`);
  }
  // Rien d'autre dans l'app ne fabrique une expression : si cela change, ce test doit le voir.
  const ailleurs = [...app.matchAll(/cron:\s*'([^']*)'/g)].map((x) => x[1]);
  for (const cron of ailleurs) assert.ok(suivant(cron) > DEPUIS, `« ${cron} » est écrite dans l’app mais refusée par le serveur`);
});

test('les cinq cadences de la fiche gardent exactement leur échéance', () => {
  const attendu = {
    '0 8 * * *': utc(13, 7, 0),      // chaque jour à 8h : demain matin
    '0 20 * * *': utc(12, 19, 0),    // chaque jour à 20h : ce soir
    '0 9 * * 1': utc(16, 8, 0),      // chaque lundi à 9h : lundi 16
    '0 * * * *': utc(12, 11, 0),     // toutes les heures : midi à Paris
    '*/30 * * * *': utc(12, 10, 30), // toutes les 30 min : 11h30 à Paris
  };
  for (const [cron, t] of Object.entries(attendu)) assert.equal(iso(suivant(cron)), iso(t), cron);
});

test('les formes déjà lues le restent : listes, plages, pas, zéros de tête, espaces', () => {
  const attendu = {
    '0,15,30,45 * * * *': utc(12, 10, 30),
    '45,0 * * * *': utc(12, 10, 45),          // une liste n'a pas à être triée
    '0 9-17 * * *': utc(12, 11, 0),
    '0 8-18/2 * * 1-5': utc(12, 11, 0),       // 8h, 10h, 12h… : midi à Paris
    '*/15 * * * *': utc(12, 10, 30),
    '10-50/20 * * * *': utc(12, 10, 30),
    '30 7 * * 1-5': utc(13, 6, 30),           // du lundi au vendredi à 7h30
    '0 9 1 * *': Date.UTC(2026, 11, 1, 8, 0), // le 1er du mois à 9h
    '0 9 1 1,7 *': Date.UTC(2027, 0, 1, 8, 0),
    '00 08 * * *': utc(13, 7, 0),
    '  0   8 * * *  ': utc(13, 7, 0),
    '* * * * *': utc(12, 10, 18),
    '0-59 0-23 1-31 1-12 0-7': utc(12, 10, 18),   // les bornes de chaque champ, 7 compris : autant dire « * »
    '59 23 31 12 *': Date.UTC(2026, 11, 31, 22, 59),
    '0 0 1 1 *': Date.UTC(2026, 11, 31, 23, 0),   // minuit le 1er janvier à Paris
  };
  for (const [cron, t] of Object.entries(attendu)) assert.equal(iso(suivant(cron)), iso(t), cron);
});

/* ── un champ illisible n'est plus lu comme « * » ── */

test('un champ illisible ou hors bornes fait refuser toute l’expression', () => {
  const refusees = [
    'abc def ghi jkl mno', '99 99 99 99 99',
    '60 * * * *', '* 24 * * *', '* * 0 * *', '* * 32 * *', '* * * 0 *', '* * * 13 *', '* * * * 8',
    '0 8 * * lun', '0 8 * * MON', '0 8 * jan *', '0 8 ? * *',
    '*/0 * * * *', '*/x * * * *', '*/ * * * *', '*/5/2 * * * *', '*/90 * * * *', '0 */24 * * *',
    '5/15 * * * *',
    '50-10 * * * *', '0 8 * * 5-1', '1- * * * *', '-5 * * * *', '1-2-3 * * * *', '0 8 * * 1-9',
    '1,,2 * * * *', ', * * * *', '1, * * * *',
    '1.5 * * * *', '1e1 * * * *', '0x10 * * * *', '+5 * * * *', '5x * * * *', '** * * * *',
  ];
  for (const cron of refusees) assert.equal(suivant(cron), null, `« ${cron} » doit être refusée`);
});

test('le mauvais nombre de champs reste refusé', () => {
  for (const cron of ['', '0 8 * *', '0 8 * * * *', 'tous les matins', null, undefined]) assert.equal(suivant(cron), null, JSON.stringify(cron));
});

test('« 0 8 * * 7 » tourne le dimanche, pas tous les jours', () => {
  const dimanches = serie('0 8 * * 7', 3);
  assert.deepEqual(dimanches.map(iso), [utc(15, 7, 0), utc(22, 7, 0), utc(29, 7, 0)].map(iso));
  assert.deepEqual(dimanches.map(jourA), ['Sun', 'Sun', 'Sun']);
  assert.deepEqual(serie('0 8 * * 0', 3), dimanches, '7 et 0 désignent le même jour');
  assert.deepEqual(serie('0 8 * * 5-7', 3).map(jourA), ['Fri', 'Sat', 'Sun'], 'la plage 5-7 va du vendredi au dimanche');
  assert.deepEqual(serie('0 8 * * 0,7', 2).map(jourA), ['Sun', 'Sun']);
});

test('une plage démesurée est refusée sans être parcourue', () => {
  const debut = performance.now();
  // La plus petite d'abord : parcourues, les suivantes ne finiraient jamais.
  for (const cron of ['0-300000000 * * * *', '0-9007199254740991 * * * *', `0-${'9'.repeat(400)} * * * *`, '* * * * 0-300000000/1']) {
    assert.equal(suivant(cron), null, `« ${cron.slice(0, 40)} » doit être refusée`);
  }
  assert.ok(performance.now() - debut < 100, 'le refus ne doit pas coûter le parcours de la plage');
});
