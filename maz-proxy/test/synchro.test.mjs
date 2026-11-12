// La synchro des conversations au plafond de 400 : ce qu'un envoi a le droit
// d'effacer. La base est une liste en mémoire qui ne comprend que les requêtes
// de PUT /sync/convo.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const BASE = 'https://maz.test';
const CODE = 'maz-TEST-TEST-TEST-TEST';
const PLAFOND = 400;

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fausseBase(hash) {
  const convos = [], imprevues = [];
  const imprevue = (sql) => { imprevues.push(sql); throw new Error('requête non prévue par le test : ' + sql); };
  const de = (uid) => convos.filter((c) => c.user_id === uid);
  const prepare = (sql) => ({
    bind: (...a) => ({
      async first() {
        if (/FROM users WHERE code_hash=\?1/.test(sql)) return a[0] === hash ? { id: 'u1', name: 'Nadia', team: null, disabled: 0, is_admin: 0 } : null;
        if (/^SELECT 1 x FROM convos WHERE user_id=\?1 AND id=\?2$/.test(sql)) return convos.some((c) => c.user_id === a[0] && c.id === a[1]) ? { x: 1 } : null;
        if (/^SELECT COUNT\(\*\) c FROM convos WHERE user_id=\?1$/.test(sql)) return { c: de(a[0]).length };
        return imprevue(sql);
      },
      async run() {
        if (/^DELETE FROM convos WHERE user_id=\?1 AND id IN \(SELECT id FROM convos WHERE user_id=\?1 ORDER BY updated_at ASC LIMIT 1\)$/.test(sql)) {
          const [ancienne] = de(a[0]).sort((x, y) => x.updated_at - y.updated_at);
          if (ancienne) convos.splice(convos.indexOf(ancienne), 1);
        } else if (/^INSERT INTO convos [^]*ON CONFLICT\(user_id,id\) DO UPDATE SET data=\?3,updated_at=\?4,deleted=0 WHERE excluded\.updated_at>=convos\.updated_at$/.test(sql)) {
          const c = convos.find((x) => x.user_id === a[0] && x.id === a[1]);
          if (!c) convos.push({ user_id: a[0], id: a[1], data: a[2], updated_at: a[3], deleted: 0 });
          else if (a[3] >= c.updated_at) Object.assign(c, { data: a[2], updated_at: a[3], deleted: 0 });
        } else return imprevue(sql);
        return { success: true };
      },
    }),
  });
  return { prepare, convos, imprevues, de };
}

// Nadia est au plafond : 400 conversations, « c0 » la plus ancienne. Une
// conversation d'un autre compte, plus ancienne encore, ne doit jamais bouger.
async function monde() {
  const db = fausseBase(await sha256hex(CODE));
  for (let i = 0; i < PLAFOND; i++) db.convos.push({ user_id: 'u1', id: 'c' + i, data: JSON.stringify({ titre: 'Conversation ' + i }), updated_at: 1000 + i, deleted: 0 });
  db.convos.push({ user_id: 'u2', id: 'de-karim', data: '{"titre":"à Karim"}', updated_at: 1, deleted: 0 });
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { throw new Error('aucun appel réseau attendu : ' + url); };
  const envoyer = async (corps) => {
    const rep = await worker.fetch(new Request(BASE + '/sync/convo', {
      method: 'PUT', headers: { 'X-Maz-Code': CODE, 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    }), { maz_db: db, ALLOWED_ORIGINS: '' }, { waitUntil() {} });
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  const fin = () => { globalThis.fetch = vraiFetch; assert.deepEqual(db.imprevues, []); };
  return { db, envoyer, fin, ids: () => db.de('u1').map((c) => c.id) };
}

test('au plafond, mettre à jour une conversation existante n’en efface aucune autre', async (t) => {
  const m = await monde(); t.after(m.fin);
  const avant = m.ids();
  const r = await m.envoyer({ id: 'c250', data: { titre: 'Conversation 250, un message de plus' }, updated_at: 9000 });
  assert.equal(r.status, 200);
  assert.deepEqual(m.ids(), avant, 'les 400 conversations doivent toutes être là, « c0 » comprise');
  assert.match(m.db.convos.find((c) => c.id === 'c250').data, /un message de plus/);
});

test('au plafond, un envoi plus ancien que la version en base est ignoré et n’efface rien', async (t) => {
  const m = await monde(); t.after(m.fin);
  const avant = structuredClone(m.db.convos);
  const r = await m.envoyer({ id: 'c250', data: { titre: 'vieille copie' }, updated_at: 5 });
  assert.equal(r.status, 200);
  assert.deepEqual(m.db.convos, avant);
});

test('au plafond, une conversation nouvelle prend la place de la plus ancienne, et d’elle seule', async (t) => {
  const m = await monde(); t.after(m.fin);
  const r = await m.envoyer({ id: 'nouvelle', data: { titre: 'Toute neuve' }, updated_at: 9000 });
  assert.equal(r.status, 200);
  const ids = m.ids();
  assert.equal(ids.length, PLAFOND);
  assert.ok(ids.includes('nouvelle'));
  assert.ok(!ids.includes('c0'), 'la plus ancienne laisse sa place');
  assert.ok(ids.includes('c1'));
  assert.equal(m.db.de('u2').length, 1, 'le plafond se compte par compte : rien ne bouge chez les autres');
});

test('sous le plafond, une conversation nouvelle s’ajoute sans rien effacer', async (t) => {
  const m = await monde(); t.after(m.fin);
  m.db.convos.splice(m.db.convos.findIndex((c) => c.id === 'c399'), 1);   // 399 conversations
  await m.envoyer({ id: 'nouvelle', data: { titre: 'Toute neuve' }, updated_at: 9000 });
  const ids = m.ids();
  assert.equal(ids.length, PLAFOND);
  assert.ok(ids.includes('c0'));
});
