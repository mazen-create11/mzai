// Contrôle d'accès du Worker : codes personnels, clé admin, origines.
// Lancement : `npm test` dans maz-proxy/ (Node 20+, aucune dépendance).
// Le Worker est appelé tel quel par son `fetch` ; seule la base D1 est remplacée
// par une table en mémoire qui ne comprend que les requêtes de ces routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const BASE = 'https://maz.test';
const CLE_ADMIN = 'cle-admin-de-test';

function fausseBase() {
  const users = [];
  const requetes = [];
  const prepare = (sql) => ({
    bind: (...a) => ({
      async first() {
        requetes.push(sql);
        if (/FROM users WHERE code_hash=\?1 AND id!=\?2/.test(sql)) return users.find((u) => u.code_hash === a[0] && u.id !== a[1]) || null;
        if (/FROM users WHERE code_hash=\?1/.test(sql)) return users.find((u) => u.code_hash === a[0]) || null;
        if (/FROM users WHERE id=\?1/.test(sql)) return users.find((u) => u.id === a[0]) || null;
        throw new Error('requête non prévue par le test : ' + sql);
      },
      async run() {
        requetes.push(sql);
        const u = users.find((x) => x.id === a[0]);
        if (/^INSERT INTO users/.test(sql)) users.push({ id: a[0], code_hash: a[1], name: a[2], team: a[3], created_at: a[4], disabled: 0, is_admin: 0, last_seen: null });
        else if (/SET last_seen/.test(sql)) u && (u.last_seen = a[1]);
        else if (/SET disabled/.test(sql)) u && (u.disabled = a[1]);
        else if (/SET code_hash/.test(sql)) u && (u.code_hash = a[1]);
        else if (/SET name/.test(sql)) u && (u.name = a[1]);
        else if (/^DELETE FROM users/.test(sql)) users.splice(users.indexOf(u), 1);
        else throw new Error('requête non prévue par le test : ' + sql);
        return { success: true };
      },
    }),
    async all() { requetes.push(sql); return { results: users }; },
  });
  return { users, requetes, prepare };
}

function monde(vars = {}) {
  const db = fausseBase();
  const attente = [];
  const env = { maz_db: db, ADMIN_KEY: CLE_ADMIN, ALLOWED_ORIGINS: '', ...vars };
  const ctx = { waitUntil: (p) => attente.push(p) };
  const appel = async (chemin, { method = 'GET', headers = {}, corps } = {}) => {
    const req = new Request(BASE + chemin, {
      method,
      headers: { ...(corps ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const rep = await worker.fetch(req, env, ctx);
    await Promise.all(attente.splice(0));
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  const admin = (chemin, corps, method = 'POST') => appel(chemin, { method, headers: { 'X-Admin-Key': CLE_ADMIN }, corps });
  return { db, appel, admin };
}

test('un code inconnu est refusé', async () => {
  const { appel } = monde();
  const r = await appel('/auth/verify', { method: 'POST', corps: { code: 'maz-AAAA-BBBB-CCCC-DDDD' } });
  assert.equal(r.status, 401);
  assert.deepEqual(r.json, { ok: false });
});

test('un code trop court ou trop long ne touche même pas la base', async () => {
  const { appel, db } = monde();
  for (const code of ['', 'maz-1234', 'x'.repeat(65)]) {
    const r = await appel('/auth/verify', { method: 'POST', corps: { code } });
    assert.equal(r.status, 401);
  }
  assert.equal(db.requetes.length, 0);
});

test('un compte créé reçoit un code au bon format, stocké haché', async () => {
  const { admin, db } = monde();
  const r = await admin('/admin/user', { name: 'Nadia' });
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^maz-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  const [u] = db.users;
  assert.match(u.code_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(db.users).includes(r.json.code), 'le code en clair ne doit apparaître nulle part en base');
});

test('le code ouvre l’accès, quelle que soit la casse', async () => {
  const { admin, appel } = monde();
  const { json: cree } = await admin('/admin/user', { name: 'Nadia' });
  for (const code of [cree.code, cree.code.toLowerCase(), cree.code.toUpperCase(), `  ${cree.code}  `]) {
    const r = await appel('/auth/verify', { method: 'POST', corps: { code } });
    assert.equal(r.status, 200, `refusé pour « ${code} »`);
    assert.equal(r.json.name, 'Nadia');
    assert.equal(r.json.admin, false);
  }
});

test('un compte révoqué n’entre plus, puis rentre une fois réactivé', async () => {
  const { admin, appel } = monde();
  const { json: cree } = await admin('/admin/user', { name: 'Nadia' });
  await admin('/admin/disable', { id: cree.id });
  assert.equal((await appel('/auth/verify', { method: 'POST', corps: { code: cree.code } })).status, 401);
  await admin('/admin/disable', { id: cree.id, enable: true });
  assert.equal((await appel('/auth/verify', { method: 'POST', corps: { code: cree.code } })).status, 200);
});

test('les routes admin exigent la clé admin ou le code d’un compte admin', async () => {
  const { admin, appel, db } = monde();
  const { json: simple } = await admin('/admin/user', { name: 'Invité' });
  const { json: chef } = await admin('/admin/user', { name: 'Chef' });
  db.users.find((u) => u.id === chef.id).is_admin = 1;

  assert.equal((await appel('/admin/users')).status, 403, 'sans rien');
  assert.equal((await appel('/admin/users', { headers: { 'X-Admin-Key': 'mauvaise-cle' } })).status, 403, 'mauvaise clé');
  assert.equal((await appel('/admin/users', { headers: { 'X-Maz-Code': simple.code } })).status, 403, 'code d’un compte ordinaire');
  assert.equal((await appel('/admin/users', { headers: { 'X-Maz-Code': chef.code } })).status, 200, 'code d’un compte admin');
  assert.equal((await appel('/admin/users', { headers: { 'X-Admin-Key': CLE_ADMIN } })).status, 200, 'clé admin');
});

test('sans clé admin configurée, aucune clé envoyée ne passe', async () => {
  const { appel } = monde({ ADMIN_KEY: '' });
  assert.equal((await appel('/admin/users', { headers: { 'X-Admin-Key': '' } })).status, 403);
  assert.equal((await appel('/admin/users', { headers: { 'X-Admin-Key': 'nimporte' } })).status, 403);
});

test('un code personnalisé faible est refusé', async () => {
  const { admin } = monde();
  const { json: u } = await admin('/admin/user', { name: 'Nadia' });
  const essai = async (code) => (await admin('/admin/setcode', { id: u.id, code })).json.error;
  assert.equal(await essai('court1'), 'code_length');
  assert.equal(await essai('seulementdeslettres'), 'code_weak');
  assert.equal(await essai('123456789012345'), 'code_weak');
  assert.equal(await essai('password2026ok'), 'code_weak');
  assert.equal(await essai('maz-azerty-2026'), 'code_weak');
});

test('un code personnalisé valide remplace l’ancien, et ne peut pas être pris deux fois', async () => {
  const { admin, appel } = monde();
  const { json: a } = await admin('/admin/user', { name: 'Nadia' });
  const { json: b } = await admin('/admin/user', { name: 'Karim' });
  assert.equal((await admin('/admin/setcode', { id: a.id, code: 'Atelier-Nadia-2026' })).status, 200);
  assert.equal((await appel('/auth/verify', { method: 'POST', corps: { code: 'atelier-nadia-2026' } })).status, 200);
  assert.equal((await appel('/auth/verify', { method: 'POST', corps: { code: a.code } })).status, 401, 'l’ancien code ne doit plus marcher');
  const doublon = await admin('/admin/setcode', { id: b.id, code: 'ATELIER-NADIA-2026' });
  assert.equal(doublon.status, 409);
  assert.equal(doublon.json.error, 'code_taken');
});

test('on ne supprime ni un compte qui a servi, ni un compte admin', async () => {
  const { admin, appel, db } = monde();
  const { json: neuf } = await admin('/admin/user', { name: 'Erreur de saisie' });
  const { json: actif } = await admin('/admin/user', { name: 'Nadia' });
  const { json: chef } = await admin('/admin/user', { name: 'Chef' });
  db.users.find((u) => u.id === chef.id).is_admin = 1;
  await appel('/auth/verify', { method: 'POST', corps: { code: actif.code } });   // le compte « sert »

  assert.equal((await admin('/admin/delete', { id: actif.id })).json.error, 'deja_utilise');
  assert.equal((await admin('/admin/delete', { id: chef.id })).json.error, 'admin_protege');
  assert.equal((await admin('/admin/delete', { id: 'inconnu' })).status, 404);
  assert.equal((await admin('/admin/delete', { id: neuf.id })).status, 200);
  assert.equal(db.users.length, 2);
});

test('une origine hors liste est refusée avant toute route', async () => {
  const { appel, db } = monde({ ALLOWED_ORIGINS: 'https://app.exemple.fr' });
  const refus = await appel('/admin/users', { headers: { Origin: 'https://ailleurs.exemple', 'X-Admin-Key': CLE_ADMIN } });
  assert.equal(refus.status, 403);
  assert.equal(refus.json.error, 'origin_forbidden');
  assert.equal(db.requetes.length, 0);
  const ok = await appel('/admin/users', { headers: { Origin: 'https://app.exemple.fr', 'X-Admin-Key': CLE_ADMIN } });
  assert.equal(ok.status, 200);
});
