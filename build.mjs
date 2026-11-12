// Assemble l'app : src/app.html + les feuilles de style + les scripts
// → mzai-v2.html, le fichier unique que GitHub Pages publie.
//
//   node build.mjs           écrit mzai-v2.html
//   node build.mjs --check   ne touche à rien, sort en erreur si mzai-v2.html
//                            ne correspond plus aux sources
//
// Un seul fichier livré, par choix : l'app s'ouvre aussi en local d'un double
// clic, sans serveur. Le découpage est donc celui des sources, pas du livrable.
// L'assemblage est une simple mise bout à bout, dans l'ordre des listes
// ci-dessous. Cet ordre compte : les styles se recouvrent en cascade, et les
// scripts partagent une seule portée, chacun s'appuyant sur les précédents.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ICI = fileURLToPath(new URL('.', import.meta.url));
export const SORTIE = 'mzai-v2.html';

export const STYLES = [
  'systeme',        // couleurs, typographie, thèmes clair et sombre
  'atelier',        // l'écran des agents, espace de noms `.at-`
  'base',           // remise à zéro, grille de l'app, infobulles
  'barres',         // barre latérale et barre du haut
  'accueil-vues',   // accueil, bibliothèque, projets
  'fil',            // le fil de conversation
  'composer',       // la zone de saisie
  'popovers',       // menus : modèle, profil, outils
  'modales',        // réglages, profil, projet, aperçu de code
  'responsive',     // replis mobile et tablette
  'ajouts',         // vues et retouches venues après, par ordre d'arrivée
  'lumiere',        // lumière d'ambiance, état « un agent travaille », gestes
  'fichiers-mac',   // accès à un dossier local
];

export const SCRIPTS = [
  'socle',            // sélecteurs, messages furtifs, tiroir, stockage local, accueil, lumière
  'etat',             // conversations, corbeille, projets, fournisseurs, modèles, réglages
  'relais',           // clés locales ou passage par le serveur
  'compte',           // code d'accès, synchro des conversations, porte d'entrée
  'alertes-admin',    // alertes des agents, gestion des comptes
  'session',          // reprise de session, profil courant, repères de modèles, pictogrammes
  'bibliotheque',     // conversations récentes, bibliothèque, export, projets
  'navigation',       // changement de vue, menus, sélecteur de modèle
  'profil-aide',      // profil, aide, nouveautés
  'reglages',         // réglages, thème, clés
  'persona-palette',  // « Mon IA », palette de commandes, raccourcis
  'messages',         // rendu du texte, bulles, aperçu de code, mémoire, consigne système
  'generation',       // l'appel au modèle et l'affichage de sa réponse
  'medias',           // images, vidéos, voix, suggestions, actions sous une réponse
  'conversations',    // créer, ouvrir, renommer, supprimer, envoyer
  'outils',           // les dix outils et leurs options
  'transcription',    // dictée, transcription de fichiers audio, sous-titres
  'fichiers',         // lecture de DOCX, XLSX et PDF dans le navigateur
  'prompts',          // commandes « / » et bibliothèque de prompts
  'joindre',          // pièces jointes, import, baguette, micro, raccourcis clavier
  'accessibilite',    // libellés automatiques des champs et des boutons
  'prise-en-main',    // première visite, installation sur l'écran d'accueil
  'atelier',          // les agents : postes, passages, contrôle
  'finitions',        // focus dans les modales, gestes tactiles
  'fichiers-mac',     // accès à un dossier du Mac, en lecture seule
  'mobile',           // appui long sur une conversation
];

const lire = (chemin) => readFileSync(ICI + chemin, 'utf8');

export function assembler() {
  const morceaux = lire('src/app.html').split(/^\/\* @inclure (css|js) \*\/\n/m);
  if (morceaux.length !== 5 || morceaux[1] !== 'css' || morceaux[3] !== 'js') throw new Error('src/app.html doit contenir une ligne « /* @inclure css */ » puis une ligne « /* @inclure js */ »');
  const tout = (dossier, noms) => noms.map((n) => {
    const texte = lire(`src/${dossier}/${n}.${dossier}`);
    if (!texte.endsWith('\n')) throw new Error(`src/${dossier}/${n}.${dossier} doit finir par un retour à la ligne`);
    return texte;
  }).join('');
  return morceaux[0] + tout('css', STYLES) + morceaux[2] + tout('js', SCRIPTS) + morceaux[4];
}

/** Les fichiers présents dans src/ mais absents des listes, et l'inverse. */
export function ecarts() {
  const out = [];
  for (const [dossier, noms] of [['css', STYLES], ['js', SCRIPTS]]) {
    const presents = readdirSync(`${ICI}src/${dossier}`).filter((f) => f.endsWith('.' + dossier)).map((f) => f.slice(0, -dossier.length - 1));
    for (const n of presents) if (!noms.includes(n)) out.push(`src/${dossier}/${n}.${dossier} n'est dans aucune liste de build.mjs`);
    for (const n of noms) if (!presents.includes(n)) out.push(`src/${dossier}/${n}.${dossier} est listé mais absent`);
    if (new Set(noms).size !== noms.length) out.push(`un nom est listé deux fois dans ${dossier}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const soucis = ecarts();
  if (soucis.length) { console.error(soucis.join('\n')); process.exit(1); }
  const neuf = assembler();
  if (process.argv.includes('--check')) {
    if (lire(SORTIE) !== neuf) {
      console.error(`${SORTIE} ne correspond plus à src/.\nSi src/ a changé : lance « node build.mjs ».\nSi ${SORTIE} a été modifié à la main : reporte la modification dans src/, puis lance « node build.mjs ».`);
      process.exit(1);
    }
    console.log(`${SORTIE} correspond aux sources.`);
  } else {
    writeFileSync(ICI + SORTIE, neuf);
    console.log(`${SORTIE} écrit : ${STYLES.length} feuilles de style, ${SCRIPTS.length} scripts, ${neuf.split('\n').length - 1} lignes.`);
  }
}
