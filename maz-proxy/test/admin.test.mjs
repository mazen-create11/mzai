// Révoquer un compte : un compte admin est protégé, comme pour la suppression.
// Même montage que acces.test.mjs, réduit aux requêtes de ces routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const BASE = 'https://maz.test';
const CLE_ADMIN = 'cle-admin-de-test';

function fausseBase() {
  const users = [], imprevues = [];
  const imprevue = (sql) => { imprevues.push(sql); throw new Error('requête non prévue par le test : ' + sql); };
  const prepare = (sql) => ({
    bind: (...a) => ({
      async first() {
        if (/FROM users WHERE code_hash=\?1/.test(sql)) return users.find((u) => u.code_hash === a[0]) || null;
        if (/FROM users WHERE id=\?1/.test(sql)) return users.find((u) => u.id === a[0]) || null;
        return imprevue(sql);
      },
      async run() {
        const u = users.find((x) => x.id === a[0]);
        if (/^INSERT INTO users/.test(sql)) users.push({ id: a[0], code_hash: a[1], name: a[2], team: a[3], created_at: a[4], disabled: 0, is_admin: 0, last_seen: null });
        else if (/SET last_seen/.test(sql)) u && (u.last_seen = a[1]);
        else if (/SET disabled/.test(sql)) u && (u.disabled = a[1]);
        else return imprevue(sql);
        return { success: true };
      },
    }),
  });
  return { users, imprevues, prepare };
}

function monde() {
  const db = fausseBase();
  const attente = [];
  const env = { maz_db: db, ADMIN_KEY: CLE_ADMIN, ALLOWED_ORIGINS: '' };
  const ctx = { waitUntil: (p) => attente.push(p) };
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { throw new Error('aucun appel réseau attendu : ' + url); };
  const appel = async (chemin, corps, headers) => {
    const rep = await worker.fetch(new Request(BASE + chemin, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corps),
    }), env, ctx);
    await Promise.all(attente.splice(0));
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  const admin = (chemin, corps) => appel(chemin, corps, { 'X-Admin-Key': CLE_ADMIN });
  const entre = async (code) => (await appel('/auth/verify', { code })).status === 200;
  /** Crée un compte par la vraie route, puis le promeut admin directement en base (aucune route ne le fait). */
  const compte = async (name, estAdmin = false) => {
    const { json } = await admin('/admin/user', { name });
    db.users.find((u) => u.id === json.id).is_admin = estAdmin ? 1 : 0;
    return { ...json, fiche: db.users.find((u) => u.id === json.id) };
  };
  const fin = () => { globalThis.fetch = vraiFetch; assert.deepEqual(db.imprevues, []); };
  return { db, appel, admin, entre, compte, fin };
}

test('révoquer un compte admin est refusé, par la clé comme par un autre admin, et il entre toujours', async (t) => {
  const m = monde(); t.after(m.fin);
  const chef = await m.compte('Chef', true);
  const second = await m.compte('Second', true);

  const parCle = await m.admin('/admin/disable', { id: chef.id });
  assert.equal(parCle.status, 400);
  assert.equal(parCle.json.error, 'admin_protege');

  const parAdmin = await m.appel('/admin/disable', { id: chef.id }, { 'X-Maz-Code': second.code });
  assert.equal(parAdmin.status, 400);
  assert.equal(parAdmin.json.error, 'admin_protege');

  const parLuiMeme = await m.appel('/admin/disable', { id: chef.id }, { 'X-Maz-Code': chef.code });
  assert.equal(parLuiMeme.json.error, 'admin_protege');

  assert.equal(chef.fiche.disabled, 0);
  assert.ok(await m.entre(chef.code));
});

test('réactiver un compte admin reste permis', async (t) => {
  const m = monde(); t.after(m.fin);
  const chef = await m.compte('Chef', true);
  chef.fiche.disabled = 1;   // état hérité d'avant la protection, ou posé à la main en base
  assert.ok(!(await m.entre(chef.code)));

  const r = await m.admin('/admin/disable', { id: chef.id, enable: true });
  assert.equal(r.status, 200);
  assert.equal(chef.fiche.disabled, 0);
  assert.ok(await m.entre(chef.code));
});

test('révoquer un compte ordinaire marche comme avant, et un identifiant inconnu ne casse rien', async (t) => {
  const m = monde(); t.after(m.fin);
  const nadia = await m.compte('Nadia');
  assert.deepEqual((await m.admin('/admin/disable', { id: nadia.id })).json, { ok: true });
  assert.equal(nadia.fiche.disabled, 1);
  assert.ok(!(await m.entre(nadia.code)));
  assert.equal((await m.admin('/admin/disable', { id: 'inconnu' })).status, 200);
  assert.equal((await m.admin('/admin/disable', {})).status, 200);
});
