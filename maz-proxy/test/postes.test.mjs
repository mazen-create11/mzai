// Créer et modifier un poste : ce que le Worker refuse, et à quel moment.
// Un refus doit arriver AVANT toute écriture : la fausse base tient donc le
// compte de ce qu'elle reçoit, compteur de synchro compris.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const BASE = 'https://maz.test';
const CODE = 'maz-TEST-TEST-TEST-TEST';

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fausseBase() {
  const tables = { users: [], ouvriers: [], chantiers: [], postes: [] };
  const ecritures = [], imprevues = [];
  let seq = 0;
  const imprevue = (sql) => { imprevues.push(sql); throw new Error('requête non prévue par le test : ' + sql); };
  const lePoste = (id) => tables.postes.find((p) => p.id === id);
  const prepare = (sql) => ({
    bind: (...a) => ({
      async first() {
        if (/FROM users WHERE code_hash=\?1/.test(sql)) return tables.users.find((u) => u.code_hash === a[0]) || null;
        const lu = sql.match(/^SELECT \* FROM (postes|ouvriers|chantiers) WHERE id=\?1 AND user_id=\?2$/);
        if (lu) { const r = tables[lu[1]].find((x) => x.id === a[0] && x.user_id === a[1]); return r ? { ...r } : null; }
        if (/^INSERT INTO compteurs /.test(sql)) { ecritures.push(sql); return { seq: ++seq }; }
        return imprevue(sql);
      },
      async run() {
        ecritures.push(sql);
        const champs = sql.match(/^UPDATE postes SET (.+),maj_at=\?\d+,seq=\?\d+ WHERE id=\?1 AND user_id=\?2$/);
        if (/^INSERT INTO postes \(id,user_id,chantier_id,ouvrier_id,nom,objectif,consigne_ver,cadence,cron,tz,decale_s,/.test(sql)) {
          tables.postes.push({
            id: a[0], user_id: a[1], chantier_id: a[2], ouvrier_id: a[3], nom: a[4], objectif: a[5], consigne_ver: 1,
            cadence: a[6], cron: a[7], tz: a[8], decale_s: a[9], prochain_at: a[10], livrable_forme: a[11], destinataire: a[12],
            ecriture_auto: 0, budget_cents: a[13], etat: 'brouillon', supprime: 0,
          });
        } else if (champs) {
          const p = tables.postes.find((x) => x.id === a[0] && x.user_id === a[1]);
          for (const paire of champs[1].split(',')) { const [col, rang] = paire.split('=?'); p[col] = a[rang - 1]; }
        } else if (/^UPDATE postes SET prochain_at=\?2 WHERE id=\?1$/.test(sql)) lePoste(a[0]).prochain_at = a[1];
        else if (/^UPDATE postes SET prochain_at=NULL WHERE id=\?1$/.test(sql)) lePoste(a[0]).prochain_at = null;
        else if (/^INSERT INTO consignes_versions /.test(sql)) { /* la consigne n'est pas l'objet de ces tests */ }
        else return imprevue(sql);
        return { success: true };
      },
    }),
  });
  return { prepare, tables, ecritures, imprevues, lePoste };
}

// Nadia (u1) appelle. Karim (u2) n'appelle jamais : ses objets sont là pour
// vérifier qu'on ne peut pas s'y rattacher.
async function monde() {
  const db = fausseBase();
  db.tables.users.push({ id: 'u1', code_hash: await sha256hex(CODE), name: 'Nadia', team: null, disabled: 0, is_admin: 0 });
  db.tables.ouvriers.push({ id: 'ouvrier-nadia', user_id: 'u1', supprime: 0 }, { id: 'ouvrier-nadia-2', user_id: 'u1', supprime: 0 }, { id: 'ouvrier-karim', user_id: 'u2', supprime: 0 });
  db.tables.chantiers.push({ id: 'chantier-nadia', user_id: 'u1', supprime: 0 }, { id: 'chantier-karim', user_id: 'u2', contexte: 'notes privées de Karim', supprime: 0 });
  db.tables.postes.push({
    id: 'p1', user_id: 'u1', chantier_id: null, ouvrier_id: 'ouvrier-nadia', nom: 'Veille du matin', objectif: '', consigne_ver: 1,
    cadence: 'cron', cron: '0 8 * * *', tz: 'Europe/Paris', decale_s: 0, prochain_at: null, livrable_forme: 'note', destinataire: null,
    ecriture_auto: 0, budget_cents: 300, etat: 'brouillon', supprime: 0,
  });
  const env = { maz_db: db, ALLOWED_ORIGINS: '' };
  const sorties = [];
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sorties.push(String(url)); throw new Error('aucun appel réseau attendu : ' + url); };
  const appel = async (chemin, method, corps) => {
    const rep = await worker.fetch(new Request(BASE + chemin, {
      method, headers: { 'X-Maz-Code': CODE, 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    }), env, { waitUntil() {} });
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  const creer = (corps) => appel('/postes', 'POST', { nom: 'Nouveau poste', ouvrier_id: 'ouvrier-nadia', ...corps });
  const modifier = (corps) => appel('/postes/p1', 'PATCH', corps);
  /** Un refus propre : 400, le bon code d'erreur, et la base n'a rien reçu. */
  const refuse = async (reponse, erreur, quoi) => {
    const avant = { postes: structuredClone(db.tables.postes), ecritures: db.ecritures.length };
    const r = await reponse();
    assert.equal(r.status, 400, quoi);
    assert.equal(r.json.error, erreur, quoi);
    assert.deepEqual(db.tables.postes, avant.postes, `${quoi} : la base ne doit pas changer`);
    assert.equal(db.ecritures.length, avant.ecritures, `${quoi} : aucune écriture ne doit partir`);
  };
  const fin = () => {
    globalThis.fetch = vraiFetch;
    assert.deepEqual(db.imprevues, []);
    assert.deepEqual(sorties, []);
  };
  return { db, creer, modifier, refuse, fin };
}

/* ── fuseau et cron : refusés avant d'être écrits ── */

test('créer un poste avec un fuseau inconnu est refusé, planifié ou non', async (t) => {
  const m = await monde(); t.after(m.fin);
  await m.refuse(() => m.creer({ cadence: 'cron', cron: '0 8 * * *', tz: 'Mars/Olympus' }), 'tz_invalide', 'poste planifié');
  await m.refuse(() => m.creer({ cadence: 'demande', tz: 'Mars/Olympus' }), 'tz_invalide', 'poste à la demande');
});

test('créer un poste planifié avec un cron et un fuseau lisibles marche, et fixe sa première échéance', async (t) => {
  const m = await monde(); t.after(m.fin);
  const r = await m.creer({ cadence: 'cron', cron: '30 7 * * 1-5', tz: 'America/New_York' });
  assert.equal(r.status, 200);
  assert.equal(r.json.tz, 'America/New_York');
  assert.ok(r.json.prochain_at > Date.now());
});

test('donner à un poste un fuseau inconnu est refusé et laisse le poste intact', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const tz of ['Mars/Olympus', '', null, 123]) await m.refuse(() => m.modifier({ tz }), 'tz_invalide', `tz ${JSON.stringify(tz)}`);
});

test('donner à un poste planifié un cron illisible est refusé avant d’écrire, pas après', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const cron of ['tous les matins', '0 8 * *', '', null, 8]) await m.refuse(() => m.modifier({ cron }), 'cron_invalide', `cron ${JSON.stringify(cron)}`);
  await m.refuse(() => m.modifier({ cron: 'tous les matins', nom: 'Autre nom', budget_cents: 500 }), 'cron_invalide', 'refus groupé');
});

test('passer un poste « à la demande » en planifié sans cron lisible est refusé', async (t) => {
  const m = await monde(); t.after(m.fin);
  Object.assign(m.db.lePoste('p1'), { cadence: 'demande', cron: null });
  await m.refuse(() => m.modifier({ cadence: 'cron' }), 'cron_invalide', 'sans cron');
  const r = await m.modifier({ cadence: 'cron', cron: '0 9 * * *' });
  assert.equal(r.status, 200);
  assert.ok(m.db.lePoste('p1').prochain_at > Date.now());
});

test('un cron et un fuseau lisibles sont acceptés et replanifient le poste', async (t) => {
  const m = await monde(); t.after(m.fin);
  const r = await m.modifier({ cron: '15 6 * * *', tz: 'Asia/Beirut' });
  assert.equal(r.status, 200);
  const p = m.db.lePoste('p1');
  assert.equal(p.cron, '15 6 * * *');
  assert.equal(p.tz, 'Asia/Beirut');
  assert.ok(p.prochain_at > Date.now());
  assert.equal(r.json.prochain_at, p.prochain_at);
});

/* ── les champs du PATCH qui passaient sans contrôle ── */

test('ecriture_auto ne peut valoir que 0 ou 1', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const v of [2, -1, 0.5, true, '1', null, [1]]) await m.refuse(() => m.modifier({ ecriture_auto: v }), 'ecriture_auto_invalide', `ecriture_auto ${JSON.stringify(v)}`);
  assert.equal((await m.modifier({ ecriture_auto: 1 })).status, 200);
  assert.equal(m.db.lePoste('p1').ecriture_auto, 1);
  assert.equal((await m.modifier({ ecriture_auto: 0 })).status, 200);
  assert.equal(m.db.lePoste('p1').ecriture_auto, 0);
});

test('le budget d’un poste est un nombre entier de centimes, de 0 à 200 €', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const v of [-1, 1.5, '300', null, 20001, 1e12]) await m.refuse(() => m.modifier({ budget_cents: v }), 'budget_invalide', `budget ${JSON.stringify(v)}`);
  for (const v of [0, 450, 20000]) {
    assert.equal((await m.modifier({ budget_cents: v })).status, 200, `budget ${v}`);
    assert.equal(m.db.lePoste('p1').budget_cents, v);
  }
});

test('à la création le budget suit la même règle, et vaut 3 € quand il n’est pas donné', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const v of [-1, 1.5, '300', null, 20001]) await m.refuse(() => m.creer({ budget_cents: v }), 'budget_invalide', `budget ${JSON.stringify(v)}`);
  assert.equal((await m.creer({})).json.budget_cents, 300);
  assert.equal((await m.creer({ budget_cents: 0 })).json.budget_cents, 0);
  assert.equal((await m.creer({ budget_cents: 1200 })).json.budget_cents, 1200);
});

test('un poste ne se rattache pas à l’ouvrier d’un autre compte', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const id of ['ouvrier-karim', 'ouvrier-qui-n-existe-pas', '', null, 42]) await m.refuse(() => m.modifier({ ouvrier_id: id }), 'ouvrier_introuvable', `ouvrier ${JSON.stringify(id)}`);
  assert.equal((await m.modifier({ ouvrier_id: 'ouvrier-nadia-2' })).status, 200);
  assert.equal(m.db.lePoste('p1').ouvrier_id, 'ouvrier-nadia-2');
});

test('un poste ne se rattache pas au chantier d’un autre compte, mais peut être détaché du sien', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const id of ['chantier-karim', 'chantier-qui-n-existe-pas', '', 42]) await m.refuse(() => m.modifier({ chantier_id: id }), 'chantier_introuvable', `chantier ${JSON.stringify(id)}`);
  assert.equal((await m.modifier({ chantier_id: 'chantier-nadia' })).status, 200);
  assert.equal(m.db.lePoste('p1').chantier_id, 'chantier-nadia');
  assert.equal((await m.modifier({ chantier_id: null })).status, 200);
  assert.equal(m.db.lePoste('p1').chantier_id, null);
});

test('à la création non plus, le chantier ou l’ouvrier d’un autre compte ne passent pas', async (t) => {
  const m = await monde(); t.after(m.fin);
  await m.refuse(() => m.creer({ chantier_id: 'chantier-karim' }), 'chantier_introuvable', 'chantier d’un autre');
  await m.refuse(() => m.creer({ ouvrier_id: 'ouvrier-karim' }), 'ouvrier_introuvable', 'ouvrier d’un autre');
  const r = await m.creer({ chantier_id: 'chantier-nadia' });
  assert.equal(r.status, 200);
  assert.equal(r.json.chantier_id, 'chantier-nadia');
});
