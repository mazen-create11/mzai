// Les pièces jointes : le texte d'un fichier est lu dans le navigateur, puis
// envoyé au modèle avec la question. Les fichiers sont fabriqués ici, à la main.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { monde, REPONSE } from './monde.mjs';

/** Une archive ZIP minimale (c'est ce qu'est un DOCX ou un XLSX). */
function zip(fichiers, { compresse = true } = {}) {
  const locaux = [], centraux = [];
  let position = 0;
  for (const [nom, texte] of Object.entries(fichiers)) {
    const n = Buffer.from(nom), brut = Buffer.from(texte), corps = compresse ? zlib.deflateRawSync(brut) : brut;
    const commun = Buffer.alloc(26);
    commun.writeUInt16LE(20, 0); commun.writeUInt16LE(0x0800, 2); commun.writeUInt16LE(compresse ? 8 : 0, 4);
    commun.writeUInt32LE(zlib.crc32(brut), 10); commun.writeUInt32LE(corps.length, 14); commun.writeUInt32LE(brut.length, 18);
    commun.writeUInt16LE(n.length, 22);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), commun, n, corps]);
    const fin = Buffer.alloc(14); fin.writeUInt32LE(position, 10);
    centraux.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2, 20, 0]), commun, fin, n]));
    locaux.push(local); position += local.length;
  }
  const repertoire = Buffer.concat(centraux), queue = Buffer.alloc(22);
  queue.writeUInt32LE(0x06054b50, 0); queue.writeUInt16LE(centraux.length, 8); queue.writeUInt16LE(centraux.length, 10);
  queue.writeUInt32LE(repertoire.length, 12); queue.writeUInt32LE(position, 16);
  return Buffer.concat([...locaux, repertoire, queue]);
}

const DOCX = zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Devis n° 42</w:t></w:r><w:r><w:t xml:space="preserve"> pour Dupont &amp; Fils</w:t></w:r></w:p><w:p><w:r><w:t>Total : 1&#160;200 &#x20AC;</w:t></w:r></w:p></w:body></w:document>' });
const XLSX = zip({
  'xl/sharedStrings.xml': '<sst><si><t>Produit</t></si><si><t>Prix</t></si><si><r><t>Savon </t></r><r><t>lavande</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>7.5</v></c></row><row><c t="inlineStr"><is><t>Note &lt;interne&gt;</t></is></c></row></sheetData></worksheet>',
}, { compresse: false });

async function envoyerAvec(t, fichiers, question = 'Résume ce document') {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await page.waitForFunction(() => /Bienvenue/.test(document.querySelector('#toast .tm').textContent));
  await page.setInputFiles('#fileInput', fichiers);
  await page.fill('#prompt', question);
  await page.click('#sendBtn');
  await page.waitForFunction((r) => document.querySelector('#chat .msg.ai')?.textContent.includes(r), REPONSE);
  const envoi = m.discussions().find((a) => JSON.stringify(a.corps.messages).includes(question));
  assert.ok(envoi, 'la question n’est partie dans aucun appel');
  return { m, envoye: envoi.corps.messages.map((x) => typeof x.content === 'string' ? x.content : JSON.stringify(x.content)).join('\n') };
}

test('un fichier texte joint part avec la question', async (t) => {
  const { m, envoye } = await envoyerAvec(t, [{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Réunion\nLivraison le 3 décembre, café offert.') }]);
  assert.match(envoye, /Livraison le 3 décembre, café offert\./);
  assert.match(envoye, /notes\.md/);
  assert.deepEqual(m.erreurs, []);
});

test('un DOCX est lu : paragraphes, morceaux recollés, caractères spéciaux décodés', async (t) => {
  const { m, envoye } = await envoyerAvec(t, [{ name: 'devis.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX }]);
  assert.match(envoye, /Devis n° 42 pour Dupont & Fils/);
  assert.match(envoye, /Total : 1 200 €/);
  assert.ok(!envoye.includes('<w:t'), 'aucune balise ne doit partir');
  assert.deepEqual(m.erreurs, []);
});

test('un XLSX est lu : textes partagés, nombres, texte en ligne', async (t) => {
  const { m, envoye } = await envoyerAvec(t, [{ name: 'tarifs.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX }]);
  assert.match(envoye, /Produit\s+Prix/);
  assert.match(envoye, /Savon lavande\s+7\.5/);
  assert.match(envoye, /Note <interne>/);
  assert.deepEqual(m.erreurs, []);
});

test('une archive abîmée ne casse rien : le modèle est prévenu que le fichier est illisible', async (t) => {
  const { m, envoye } = await envoyerAvec(t, [{ name: 'casse.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('ceci n’est pas une archive, mais il faut plus de vingt-deux octets') }]);
  assert.match(envoye, /Impossible de lire « casse\.docx »/);
  assert.deepEqual(m.erreurs, []);
});

test('un format non géré ne casse rien : la question part, sans contenu inventé', async (t) => {
  const { m, envoye } = await envoyerAvec(t, [{ name: 'maquette.sketch', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) }]);
  assert.match(envoye, /Résume ce document/);
  assert.ok(!envoye.includes('```'), 'aucun bloc de fichier ne doit être fabriqué');
  assert.match(await m.page.textContent('#chat .msg.user'), /maquette\.sketch/, 'le fichier reste visible dans le message de l’utilisateur');
  assert.deepEqual(m.erreurs, []);
});

test('la lecture des fichiers est un module fermé : deux fonctions publiques, rien d’autre dans la portée de l’app', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const vu = await m.page.evaluate(() => ({
    publiques: Object.keys(Fichiers).sort(),
    temoin: (0, eval)('typeof toast'),   // la sonde voit bien la portée de l'app
    fuites: ['XENT', 'decX', 'zipEntries', 'zipText', 'docxText', 'xlsxText', '_pdfjs', 'loadPdfjs', 'pdfText', 'pdfToImages', 'TEXT_EXT', 'extractFileText']
      .filter((nom) => { try { return (0, eval)(`typeof ${nom}`) !== 'undefined'; } catch { return true; } }),
  }));
  assert.deepEqual(vu, { publiques: ['extractFileText', 'pdfToImages'], temoin: 'function', fuites: [] });
});
