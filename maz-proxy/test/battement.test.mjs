// Le battement : quels postes planifiés partent, et ce qui arrive à celui
// qu'on ne sait pas planifier. `battement` est appelé directement.
// La base est une table en mémoire qui ne comprend que ses requêtes. `lancer`
// s'arrête ici à sa première lecture (la fausse base n'a aucun ouvrier) : c'est
// assez pour savoir quels postes sont partis, sans simuler le fournisseur.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../atelier.js';

const MIN = 60_000;
const compte = (id, extra = {}) => ({ id, name: id, disabled: 0, alerte_email: null, alerte_webhook: null, alerte_at: 0, alerte_ok_at: 0, alerte_succes: 0, ...extra });
const poste = (id, user_id, extra = {}) => ({
  id, user_id, ouvrier_id: 'ouvrier-de-' + id, chantier_id: null, nom: 'Poste ' + id, consigne_ver: 1,
  cadence: 'cron', cron: '0 8 * * *', tz: 'Europe/Paris', decale_s: 0, prochain_at: Date.now() - MIN,
  etat: 'actif', supprime: 0, sante: '', ...extra,
});

function fausseBase(users, postes) {
  const passages = [], partis = [], imprevues = [];
  // Plusieurs écritures du battement avalent leurs erreurs : lever ne suffit
  // pas, on garde aussi la trace pour que le test puisse la contrôler.
  const imprevue = (sql) => { imprevues.push(sql); throw new Error('requête non prévue par le test : ' + sql); };
  const lePoste = (id) => postes.find((p) => p.id === id);
  const prepare = (sql) => ({
    bind: (...a) => ({
      async all() {
        if (/^SELECT \* FROM postes WHERE etat='actif' AND supprime=0 AND cadence='cron'/.test(sql)) {
          // Pas de moteur SQL ici : les comptes révoqués ne sont écartés que si
          // la requête le demande, comme le ferait la vraie base.
          const sansRevoques = /user_id IN \(SELECT id FROM users WHERE disabled=0\)/.test(sql);
          return {
            results: postes
              .filter((p) => p.etat === 'actif' && !p.supprime && p.cadence === 'cron' && p.prochain_at != null && p.prochain_at <= a[0])
              .filter((p) => !sansRevoques || users.some((u) => u.id === p.user_id && !u.disabled))
              .sort((x, y) => x.prochain_at - y.prochain_at).slice(0, 6).map((p) => ({ ...p })),
          };
        }
        return imprevue(sql);
      },
      async first() {
        if (/^SELECT \* FROM ouvriers WHERE id=\?1 AND user_id=\?2 AND supprime=0/.test(sql)) {
          partis.push(postes.find((p) => p.ouvrier_id === a[0]).id);
          return null;   // `lancer` s'arrête là, avec « ouvrier_introuvable »
        }
        if (/^SELECT id,name,alerte_email,alerte_webhook,alerte_at,alerte_ok_at,alerte_succes FROM users WHERE id=\?1/.test(sql)) return users.find((u) => u.id === a[0]) || null;
        return imprevue(sql);
      },
      async run() {
        if (/^UPDATE postes SET prochain_at=\?2 WHERE id=\?1$/.test(sql)) lePoste(a[0]).prochain_at = a[1];
        else if (/^UPDATE postes SET prochain_at=NULL,etat=\?2 WHERE id=\?1$/.test(sql)) Object.assign(lePoste(a[0]), { prochain_at: null, etat: a[1] });
        else if (/^UPDATE postes SET sante=\?2,maj_at=\?3 WHERE id=\?1$/.test(sql)) lePoste(a[0]).sante = a[1];
        else if (/^UPDATE users SET alerte_at=\?2 WHERE id=\?1$/.test(sql)) users.find((u) => u.id === a[0]).alerte_at = a[1];
        else if (/^INSERT INTO passages [^]*'cadence','echec'/.test(sql)) passages.push({ user_id: a[1], poste_id: a[2], erreur: a[4] });
        else return imprevue(sql);
        return { success: true };
      },
    }),
  });
  return { prepare, passages, partis, imprevues, lePoste };
}

function monde(users, postes) {
  const db = fausseBase(users, postes);
  const attente = [], sorties = [];
  const ctx = { waitUntil: (p) => attente.push(p) };
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    sorties.push({ url: String(url), corps: String(init.body || '') });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const battre = async () => {
    const n = await A.battement({ maz_db: db }, ctx);
    await Promise.all(attente.splice(0));
    return n;
  };
  return { db, battre, sorties, fin: () => { globalThis.fetch = vraiFetch; } };
}

/* ── un poste cassé ne bloque plus les autres ── */

const troisPostesDontUnCasse = () => [
  poste('casse', 'u1', { tz: 'Mars/Olympus', prochain_at: Date.now() - 3 * MIN }),   // le plus ancien dû : il sort en tête de file
  poste('sain-1', 'u1', { prochain_at: Date.now() - 2 * MIN }),
  poste('sain-2', 'u2', { prochain_at: Date.now() - MIN }),
];

test('un poste au fuseau illisible n’empêche pas les autres postes dus de partir', async (t) => {
  const m = monde([compte('u1'), compte('u2')], troisPostesDontUnCasse()); t.after(m.fin);
  assert.equal(await m.battre(), 3);
  assert.deepEqual(m.db.partis, ['sain-1', 'sain-2']);
  for (const id of ['sain-1', 'sain-2']) assert.ok(m.db.lePoste(id).prochain_at > Date.now(), `${id} doit être replanifié`);
  assert.deepEqual(m.db.imprevues, []);
});

test('le poste au fuseau illisible sort de la file : en pause, échec au journal, plus jamais repris', async (t) => {
  const m = monde([compte('u1'), compte('u2')], troisPostesDontUnCasse()); t.after(m.fin);
  await m.battre();
  const casse = m.db.lePoste('casse');
  assert.equal(casse.etat, 'pause');
  assert.equal(casse.prochain_at, null);
  assert.equal(casse.sante, 'X');
  const journal = () => m.db.passages.filter((p) => p.poste_id === 'casse');
  assert.equal(journal().length, 1);
  assert.match(journal()[0].erreur, /^Planification impossible : .*Mars\/Olympus/);
  assert.ok(!m.db.partis.includes('casse'), 'un poste impossible à planifier ne doit pas être lancé');

  assert.equal(await m.battre(), 0, 'au battement suivant, plus rien n’est dû');
  assert.equal(journal().length, 1, 'l’échec n’est noté qu’une fois');
  assert.deepEqual(m.db.imprevues, []);
});

test('le propriétaire du poste abandonné est prévenu par son webhook', async (t) => {
  const m = monde([compte('u1', { alerte_webhook: 'https://alertes.exemple/maz' }), compte('u2')], troisPostesDontUnCasse()); t.after(m.fin);
  await m.battre();
  assert.equal(m.sorties.length, 1);
  assert.equal(m.sorties[0].url, 'https://alertes.exemple/maz');
  assert.match(m.sorties[0].corps, /Poste casse/);
  assert.match(m.sorties[0].corps, /Planification impossible/);
  assert.deepEqual(m.db.imprevues, []);
});

/* ── les comptes révoqués ne sont plus planifiés ── */

test('les postes d’un compte révoqué ou supprimé ne partent plus, ceux des autres continuent', async (t) => {
  const karim = compte('u2', { disabled: 1, alerte_webhook: 'https://alertes.exemple/karim' });
  const m = monde([compte('u1'), karim], [
    poste('de-karim', 'u2', { prochain_at: Date.now() - 3 * MIN }),
    poste('orphelin', 'compte-supprime', { prochain_at: Date.now() - 2 * MIN }),
    poste('de-nadia', 'u1', { prochain_at: Date.now() - MIN }),
  ]); t.after(m.fin);
  const echeance = m.db.lePoste('de-karim').prochain_at;

  assert.equal(await m.battre(), 1);
  assert.deepEqual(m.db.partis, ['de-nadia']);
  assert.equal(m.db.lePoste('de-karim').prochain_at, echeance, 'le poste du compte révoqué n’est pas touché');
  assert.equal(m.db.lePoste('de-karim').etat, 'actif');
  assert.deepEqual(m.db.passages.filter((p) => p.user_id !== 'u1'), []);
  assert.equal(m.sorties.length, 0, 'rien ne sort pour un compte révoqué');

  karim.disabled = 0;   // réactivé : son poste repart au battement suivant
  await m.battre();
  assert.deepEqual(m.db.partis, ['de-nadia', 'de-karim']);
  assert.deepEqual(m.db.imprevues, []);
});

test('six postes dus d’un compte révoqué ne prennent pas les six places du battement', async (t) => {
  const anciens = Array.from({ length: 6 }, (_, i) => poste('de-karim-' + i, 'u2', { prochain_at: Date.now() - (10 - i) * MIN }));
  const m = monde([compte('u1'), compte('u2', { disabled: 1 })], [...anciens, poste('de-nadia', 'u1')]); t.after(m.fin);
  await m.battre();
  assert.deepEqual(m.db.partis, ['de-nadia']);
  assert.deepEqual(m.db.imprevues, []);
});
