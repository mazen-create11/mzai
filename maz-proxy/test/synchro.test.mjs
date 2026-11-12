// La synchro des conversations au plafond de 400 : ce qu'un envoi a le droit
// d'effacer, ce que deviennent les lignes « supprimée », ce que la liste rend.
// La base est une liste en mémoire qui ne comprend que les requêtes de
// /sync/convo (PUT, DELETE) et de /sync/convos (GET).
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
  // `supprimee` : 0 pour les vivantes, 1 pour les supprimées, rien pour toutes
  const de = (uid, supprimee) => convos.filter((c) => c.user_id === uid && (supprimee === undefined || c.deleted === supprimee));
  const retirer = (lignes) => { for (const c of lignes) convos.splice(convos.indexOf(c), 1); };
  const prepare = (sql) => ({
    bind: (...a) => ({
      async first() {
        if (/FROM users WHERE code_hash=\?1/.test(sql)) return a[0] === hash ? { id: 'u1', name: 'Nadia', team: null, disabled: 0, is_admin: 0 } : null;
        if (/^SELECT deleted,updated_at FROM convos WHERE user_id=\?1 AND id=\?2$/.test(sql)) {
          const c = convos.find((x) => x.user_id === a[0] && x.id === a[1]);
          return c ? { deleted: c.deleted, updated_at: c.updated_at } : null;
        }
        if (/^SELECT COUNT\(\*\) c FROM convos WHERE user_id=\?1 AND deleted=0$/.test(sql)) return { c: de(a[0], 0).length };
        return imprevue(sql);
      },
      async all() {
        if (/^SELECT id,data,updated_at,deleted FROM convos WHERE user_id=\?1 AND deleted=\?2 ORDER BY updated_at DESC LIMIT \?3$/.test(sql)) {
          return { results: de(a[0], a[1]).sort((x, y) => y.updated_at - x.updated_at).slice(0, a[2]).map(({ user_id, ...c }) => c) };
        }
        return imprevue(sql);
      },
      async run() {
        if (/^DELETE FROM convos WHERE user_id=\?1 AND id IN \(SELECT id FROM convos WHERE user_id=\?1 AND deleted=0 ORDER BY updated_at ASC LIMIT 1\)$/.test(sql)) {
          retirer(de(a[0], 0).sort((x, y) => x.updated_at - y.updated_at).slice(0, 1));
        } else if (/^UPDATE convos SET deleted=1,data=\?3,updated_at=\?4 WHERE user_id=\?1 AND id=\?2$/.test(sql)) {
          const c = convos.find((x) => x.user_id === a[0] && x.id === a[1]);
          if (c) Object.assign(c, { deleted: 1, data: a[2], updated_at: a[3] });
        } else if (/^DELETE FROM convos WHERE user_id=\?1 AND deleted=1 AND id IN \(SELECT id FROM convos WHERE user_id=\?1 AND deleted=1 ORDER BY updated_at DESC LIMIT -1 OFFSET \?2\)$/.test(sql)) {
          retirer(de(a[0], 1).sort((x, y) => y.updated_at - x.updated_at).slice(a[1]));
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
  const appel = async (chemin, method, corps) => {
    const rep = await worker.fetch(new Request(BASE + chemin, {
      method, headers: { 'X-Maz-Code': CODE, 'Content-Type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps),
    }), { maz_db: db, ALLOWED_ORIGINS: '' }, { waitUntil() {} });
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  const envoyer = (corps) => appel('/sync/convo', 'PUT', corps);
  const supprimer = (id) => appel('/sync/convo?id=' + encodeURIComponent(id), 'DELETE');
  const lister = () => appel('/sync/convos', 'GET');
  const fin = () => { globalThis.fetch = vraiFetch; assert.deepEqual(db.imprevues, []); };
  /** Des lignes « supprimée » déjà en base, de la plus ancienne à la plus récente. */
  const dejaSupprimees = (n, { uid = 'u1', depuis = 5000 } = {}) => {
    for (let i = 0; i < n; i++) db.convos.push({ user_id: uid, id: `s${i}-${uid}`, data: '{}', updated_at: depuis + i, deleted: 1 });
  };
  return {
    db, envoyer, supprimer, lister, fin, dejaSupprimees,
    ids: () => db.de('u1').map((c) => c.id),
    vivantes: () => db.de('u1', 0).map((c) => c.id),
    supprimees: () => db.de('u1', 1).map((c) => c.id),
  };
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

/* ── les lignes « supprimée » ne prennent plus la place des vivantes ── */

test('supprimer dix conversations rend dix places : la suivante n’efface plus la plus ancienne vivante', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (let i = 390; i < PLAFOND; i++) assert.equal((await m.supprimer('c' + i)).status, 200);
  assert.equal(m.vivantes().length, 390);
  assert.equal(m.supprimees().length, 10, 'les suppressions restent en base, pour les autres appareils');

  const r = await m.envoyer({ id: 'nouvelle', data: { titre: 'Toute neuve' }, updated_at: 9000 });
  assert.equal(r.status, 200);
  const vivantes = m.vivantes();
  assert.equal(vivantes.length, 391);
  assert.ok(vivantes.includes('nouvelle'));
  assert.ok(vivantes.includes('c0'), 'il restait dix places : aucune conversation vivante ne doit partir');
  assert.equal(m.supprimees().length, 10);
});

test('au plafond de vivantes, c’est la plus ancienne vivante qui laisse sa place, jamais plus de 400', async (t) => {
  const m = await monde(); t.after(m.fin);
  m.dejaSupprimees(10, { depuis: 1 });   // plus anciennes que toutes les vivantes
  const r = await m.envoyer({ id: 'nouvelle', data: { titre: 'Toute neuve' }, updated_at: 9000 });
  assert.equal(r.status, 200);
  const vivantes = m.vivantes();
  assert.equal(vivantes.length, PLAFOND, 'effacer une ligne supprimée ne libère aucune place parmi les vivantes');
  assert.ok(vivantes.includes('nouvelle'));
  assert.ok(!vivantes.includes('c0'), 'la plus ancienne vivante laisse sa place');
  assert.ok(vivantes.includes('c1'));
  assert.equal(m.supprimees().length, 10, 'les suppressions attendues par les autres appareils ne bougent pas');
});

test('ramener une conversation supprimée compte comme une arrivée, sauf si l’envoi est plus ancien que la suppression', async (t) => {
  const m = await monde(); t.after(m.fin);
  m.db.convos.push({ user_id: 'u1', id: 'effacee', data: '{}', updated_at: 5000, deleted: 1 });

  // Copie plus ancienne que la suppression : ignorée, et rien ne doit lui faire de la place.
  const avant = structuredClone(m.db.convos);
  assert.equal((await m.envoyer({ id: 'effacee', data: { titre: 'vieille copie' }, updated_at: 4000 })).status, 200);
  assert.deepEqual(m.db.convos, avant);

  // Modifiée après la suppression : elle revient, et prend la place de la plus ancienne vivante.
  assert.equal((await m.envoyer({ id: 'effacee', data: { titre: 'reprise ailleurs' }, updated_at: 6000 })).status, 200);
  const vivantes = m.vivantes();
  assert.equal(vivantes.length, PLAFOND);
  assert.ok(vivantes.includes('effacee'));
  assert.ok(!vivantes.includes('c0'));
  assert.deepEqual(m.supprimees(), []);
});

/* ── les lignes « supprimée » ne s'accumulent plus sans fin ── */

test('on garde les 400 suppressions les plus récentes, les plus anciennes sont effacées', async (t) => {
  const m = await monde(); t.after(m.fin);
  m.dejaSupprimees(PLAFOND);                       // « s0-u1 » est la plus ancienne
  m.dejaSupprimees(1, { uid: 'u2', depuis: 1 });   // chez Karim, plus ancienne encore
  assert.equal((await m.supprimer('c7')).status, 200);

  const supprimees = m.supprimees();
  assert.equal(supprimees.length, PLAFOND);
  assert.ok(supprimees.includes('c7'), 'la suppression qu’on vient de faire est gardée');
  assert.ok(!supprimees.includes('s0-u1'), 'la plus ancienne suppression est oubliée');
  assert.ok(supprimees.includes('s1-u1'));
  assert.equal(m.db.convos.find((c) => c.id === 'c7').data, '{}', 'le contenu est effacé, il ne reste que la marque');
  assert.equal(m.vivantes().length, PLAFOND - 1, 'aucune autre conversation vivante n’est touchée');
  assert.equal(m.db.de('u2').length, 2, 'rien ne bouge chez les autres');
});

/* ── ce que la liste rend ── */

test('la liste rend toutes les vivantes, même quand 400 suppressions sont plus récentes qu’elles', async (t) => {
  const m = await monde(); t.after(m.fin);
  m.dejaSupprimees(PLAFOND);   // toutes plus récentes que la plus récente des vivantes
  const r = await m.lister();
  assert.equal(r.status, 200);
  const vivantes = r.json.filter((l) => !l.deleted), supprimees = r.json.filter((l) => l.deleted);
  assert.equal(vivantes.length, PLAFOND, 'aucune conversation vivante ne doit sortir de la réponse');
  assert.deepEqual(vivantes.map((l) => l.id).sort(), m.vivantes().sort());
  assert.equal(supprimees.length, PLAFOND, 'les suppressions sont rendues aussi : c’est par elles qu’un autre appareil efface sa copie');
  assert.ok(supprimees.every((l) => l.data === '{}'));
  assert.deepEqual(Object.keys(r.json[0]).sort(), ['data', 'deleted', 'id', 'updated_at'], 'la forme d’une ligne ne change pas');
  assert.deepEqual(r.json.map((l) => l.updated_at), r.json.map((l) => l.updated_at).sort((x, y) => y - x), 'de la plus récente à la plus ancienne, comme avant');
  assert.ok(!r.json.some((l) => l.id === 'de-karim'), 'la liste est celle du compte, pas celle des autres');
});

test('une conversation supprimée apparaît dans la liste comme supprimée, sans son contenu', async (t) => {
  const m = await monde(); t.after(m.fin);
  await m.supprimer('c12');
  const ligne = (await m.lister()).json.find((l) => l.id === 'c12');
  assert.equal(ligne.deleted, 1);
  assert.equal(ligne.data, '{}');
  assert.ok(ligne.updated_at > 1000 + 12, 'la suppression est datée d’après la dernière version');
});
