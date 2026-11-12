// Discuter : envoyer un message, changer de modèle, retrouver ses conversations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monde, CODE, REPONSE } from './monde.mjs';

const pret = (page) => page.waitForFunction(() => /Bienvenue/.test(document.querySelector('#toast .tm').textContent));
const reponses = (page, n) => page.waitForFunction(({ r, n }) => [...document.querySelectorAll('#chat .msg.ai')].filter((b) => b.textContent.includes(r)).length >= n, { r: REPONSE, n });
async function attendre(lire, ms = 8000) {
  const fin = Date.now() + ms;
  for (;;) { const v = lire(); if (v) return v; if (Date.now() > fin) throw new Error('attendu en vain'); await new Promise((ok) => setTimeout(ok, 50)); }
}

test('un message envoyé part au relais avec le code, et la réponse s’affiche', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await pret(page);
  await page.fill('#prompt', 'Bonjour, qui es-tu ?');
  await page.click('#sendBtn');
  await reponses(page, 1);

  assert.equal(await page.locator('#chat .msg.user').count(), 1);
  assert.match(await page.textContent('#chat .msg.user'), /Bonjour, qui es-tu \?/);
  assert.equal(await page.inputValue('#prompt'), '', 'le champ se vide après l’envoi');

  const [envoi] = m.discussions();
  assert.equal(envoi.method, 'POST');
  assert.equal(envoi.chemin, '/or/api/v1/chat/completions');
  assert.equal(envoi.code, CODE);
  assert.equal(envoi.corps.model, 'deepseek/deepseek-v4-flash', 'MAZ Auto choisit le modèle rapide pour une question simple');
  assert.equal(envoi.corps.stream, true);
  assert.equal(envoi.corps.messages.at(-1).role, 'user');
  assert.match(JSON.stringify(envoi.corps.messages.at(-1).content), /Bonjour, qui es-tu \?/);
  assert.deepEqual(m.erreurs, []);
});

test('la conversation est enregistrée sur le compte, et revient après rechargement', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await pret(page);
  await page.fill('#prompt', 'Garde une trace de ceci');
  await page.keyboard.press('Enter');
  await reponses(page, 1);

  const sauvegarde = await attendre(() => m.appels.find((a) => a.method === 'PUT' && a.chemin === '/sync/convo'));
  assert.equal(sauvegarde.code, CODE);
  assert.equal(sauvegarde.corps.id, sauvegarde.corps.data.id);
  assert.deepEqual(sauvegarde.corps.data.msgs.map((x) => [x.role, x.text]), [['user', 'Garde une trace de ceci'], ['ai', REPONSE]]);

  await page.reload();
  await pret(page);
  const pastille = page.locator(`#recentList .chat-pill[data-id="${sauvegarde.corps.id}"]`);
  await pastille.waitFor();
  await pastille.click();
  await reponses(page, 1);
  assert.match(await page.textContent('#chat .msg.user'), /Garde une trace de ceci/);
  assert.deepEqual(m.erreurs, []);
});

test('changer de modèle : le choix s’affiche, part au relais avec l’historique, et tient au rechargement', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await pret(page);
  await page.fill('#prompt', 'Première question');
  await page.click('#sendBtn');
  await reponses(page, 1);

  await page.click('#modelPill');
  await page.waitForSelector('#popModel.show');
  await page.click('#popModel .pi[data-model="DeepSeek V4 Pro"]');
  assert.equal(await page.textContent('.model-pill .lbl'), 'DeepSeek V4 Pro');
  assert.equal(await page.locator('#popModel.show').count(), 0, 'le sélecteur se referme');

  await page.fill('#prompt', 'Deuxième question');
  await page.click('#sendBtn');
  await reponses(page, 2);
  const envoi = m.discussions().find((a) => a.corps.model === 'deepseek/deepseek-v4-pro');
  assert.ok(envoi, 'aucun appel avec le modèle choisi');
  assert.equal(envoi.corps.stream, true);
  const fil = JSON.stringify(envoi.corps.messages);
  assert.match(fil, /Première question/);
  assert.match(fil, /Deuxième question/);

  await page.reload();
  await pret(page);
  assert.equal(await page.textContent('.model-pill .lbl'), 'DeepSeek V4 Pro');
  assert.deepEqual(m.erreurs, []);
});

test('une conversation venue d’un autre appareil apparaît, une conversation supprimée ailleurs disparaît', async (t) => {
  const ailleurs = { id: 'cdautreappareil', title: 'Écrite sur le téléphone', model: 'MAZ Auto', ts: 2000, pid: null,
    msgs: [{ role: 'user', text: 'Depuis le téléphone', files: [] }, { role: 'ai', text: 'Bien reçu.', model: 'DeepSeek V4 Flash' }] };
  const m = await monde({ connecte: true, convos: [{ id: ailleurs.id, data: JSON.stringify(ailleurs), updated_at: 2000, deleted: 0 }] }); t.after(m.fin);
  const { page } = m;
  await pret(page);
  const pastille = page.locator(`#recentList .chat-pill[data-id="${ailleurs.id}"]`);
  await pastille.waitFor();
  await pastille.click();
  await page.waitForFunction(() => document.querySelector('#chat').textContent.includes('Depuis le téléphone'));
  assert.match(await page.textContent('#chat .msg.ai'), /Bien reçu\./);
  assert.ok(!m.appels.some((a) => a.method === 'PUT' && a.chemin === '/sync/convo'), 'une conversation déjà à jour n’est pas renvoyée');

  // supprimée depuis l'autre appareil : il ne reste que la marque
  m.etat.convos = [{ id: ailleurs.id, data: '{}', updated_at: 3000, deleted: 1 }];
  await page.reload();
  await pret(page);
  await page.waitForFunction((id) => !document.querySelector(`#recentList .chat-pill[data-id="${id}"]`), ailleurs.id);
  assert.deepEqual(m.erreurs, []);
});
