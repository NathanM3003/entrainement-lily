// Extrait la banque d'exercices et ses illustrations à partir des documents de docs/.
//
// - docs/Banque d'exercices.md fait foi pour les statuts, dosages, matériel, versions et dates « Dès ».
// - docs/banque-illustree.html fournit les dessins (SVG), « Pour le frisbee » et les liens vidéo,
//   ainsi que le détail des exercices exclus.
//
// Usage : npm run banque
// Sorties (à ne pas modifier à la main) :
//   src/donnees/banque.generated.json
//   src/donnees/illustrations.generated.json
//   src/donnees/illustrations.generated.css

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossierDocs = join(racine, 'docs');
const dossierSortie = join(racine, 'src', 'donnees');

function trouverDoc(debut) {
  const nom = readdirSync(dossierDocs).find((n) => n.normalize('NFC').startsWith(debut));
  if (!nom) throw new Error(`Document introuvable dans docs/ : ${debut}…`);
  return readFileSync(join(dossierDocs, nom), 'utf8').normalize('NFC');
}

const TYPES = { F: 'force', V: 'vitesse', A: 'agilite', P: 'pliometrie', E: 'endurance', M: 'prevention' };
const RE_ID = /\b[FVAPEM]\d{1,2}\b/g;

const sansGras = (s) => s.replace(/\*\*/g, '').trim();

function decoderEntites(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const texte = (s) => decoderEntites(s.replace(/<[^>]+>/g, '')).trim();

// « **Nom** (Catégorie). Description. » — la catégorie peut contenir des parenthèses.
function decouperCelluleExercice(cellule) {
  const m = /^\*\*(.+?)\*\* \(/.exec(cellule);
  if (!m) throw new Error(`Cellule d'exercice illisible : ${cellule}`);
  let i = m[0].length;
  let profondeur = 1;
  const debut = i;
  while (i < cellule.length && profondeur > 0) {
    if (cellule[i] === '(') profondeur++;
    if (cellule[i] === ')') profondeur--;
    i++;
  }
  const categorie = cellule.slice(debut, i - 1).trim();
  const description = cellule.slice(i).replace(/^\.\s*/, '').trim();
  return { nom: m[1].trim(), categorie, description };
}

function statutDepuis(cellule) {
  if (/^Validé/.test(cellule)) return { statut: 'valide' };
  if (/À essayer/.test(cellule)) {
    const note = sansGras(cellule).replace(/^À essayer\.\s*/, '');
    return {
      statut: 'a-essayer',
      remplacements: [...new Set(note.match(RE_ID) ?? [])],
      reserve: /réserve/i.test(note),
      noteStatut: note,
    };
  }
  throw new Error(`Statut inconnu : ${cellule}`);
}

function desDepuis(cellule) {
  const v = cellule.trim().toLowerCase();
  if (v === 'maintenant') return 'maintenant';
  if (v === 'décembre') return 'decembre';
  if (v === 'janvier') return 'janvier';
  throw new Error(`Date « Dès » inconnue : ${cellule}`);
}

// ---------- Markdown : exercices retenus et liste des exclus ----------

function lireMarkdown(md) {
  const retenus = [];
  const exclus = [];
  for (const section of md.split(/^## /m).slice(1)) {
    const lettre = /\(([FVAPEM])\)/.exec(section.split('\n', 1)[0])?.[1];
    if (!lettre) continue;
    for (const ligne of section.split('\n')) {
      if (ligne.startsWith('|')) {
        const cellules = ligne.slice(1, -1).split('|').map((c) => c.trim());
        if (!/^[FVAPEM]\d+$/.test(cellules[0] ?? '')) continue;
        const [id, exercice, statut, dosage, materiel, plusFacile, plusDifficile, des] = cellules;
        retenus.push({
          id,
          type: TYPES[lettre],
          ...decouperCelluleExercice(exercice),
          ...statutDepuis(statut),
          dosage: sansGras(dosage),
          materiel: sansGras(materiel),
          plusFacile: sansGras(plusFacile),
          plusDifficile: sansGras(plusDifficile),
          des: desDepuis(des),
        });
      }
      const ex = /^Exclus : (.+?)\.?$/.exec(ligne);
      if (ex) {
        for (const m of ex[1].matchAll(/([FVAPEM]\d+) (.+?)(?=, [FVAPEM]\d+ |$)/g)) {
          exclus.push({ id: m[1], type: TYPES[lettre], nom: m[2].trim() });
        }
      }
    }
  }
  return { retenus, exclus };
}

// ---------- HTML : cartes, dessins et styles des dessins ----------

function lireCartes(html) {
  const cartes = new Map();
  for (const m of html.matchAll(/<article class="card" id="([^"]+)" data-t="([^"]+)">([\s\S]*?)<\/article>/g)) {
    const [, id, , corps] = m;
    const champs = {};
    for (const d of corps.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)) champs[texte(d[1])] = texte(d[2]);
    const svg = /<svg class="ex"[\s\S]*?<\/svg>/.exec(corps)?.[0];
    cartes.set(id, {
      nom: texte(/<h4>([\s\S]*?)<\/h4>/.exec(corps)?.[1] ?? ''),
      description: texte(/<p class="desc">([\s\S]*?)<\/p>/.exec(corps)?.[1] ?? ''),
      champs,
      video: decoderEntites(/<a class="video" href="([^"]+)"/.exec(corps)?.[1] ?? '') || undefined,
      svg: svg ? nettoyerSvg(svg) : undefined,
    });
  }
  return cartes;
}

function nettoyerSvg(svg) {
  return svg.replace('<svg class="ex"', '<svg class="illu-svg"').replace(/>\s+</g, '><');
}

function blocsCss(html) {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
  const sansCommentaires = style.replace(/\/\*[\s\S]*?\*\//g, '');
  // Règles « plates » ; les règles à l'intérieur d'un @media sont aussi capturées, sans leur contexte.
  return [...sansCommentaires.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selecteur: m[1].trim(),
    corps: m[2].trim(),
  }));
}

function variables(corps) {
  const vars = {};
  for (const m of corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function construireCss(html, svgs) {
  const classesSvg = new Set();
  for (const svg of svgs) for (const m of svg.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => classesSvg.add(c));
  classesSvg.delete('illu-svg');

  const blocs = blocsCss(html);
  const regles = blocs.filter(({ selecteur }) => {
    const parties = selecteur.split(',').map((s) => s.trim());
    return parties.every((p) => /^\.[\w-]+$/.test(p) && classesSvg.has(p.slice(1)));
  });

  const varsUtilisees = new Set();
  for (const texteSource of [...regles.map((r) => r.corps), ...svgs]) {
    for (const m of texteSource.matchAll(/var\((--[\w-]+)\)/g)) varsUtilisees.add(m[1]);
  }
  const clair = variables(blocs.find((b) => b.selecteur === ':root')?.corps ?? '');
  const sombre = variables(blocs.find((b) => b.selecteur === ':root[data-theme="dark"]')?.corps ?? '');

  const renommer = (s) => s.replace(/var\(--([\w-]+)\)/g, 'var(--il-$1)');
  for (const v of varsUtilisees) if (!(v in clair)) throw new Error(`Variable introuvable dans :root : ${v}`);
  // Le mode sombre ne redéclare que les variables qui changent (les polices, par exemple, restent).
  const declarer = (vals) =>
    [...varsUtilisees]
      .sort()
      .filter((v) => v in vals)
      .map((v) => `  --il-${v.slice(2)}: ${vals[v]};`)
      .join('\n');

  const nonCouvertes = [...classesSvg].filter((c) => !regles.some((r) => r.selecteur.split(',').some((p) => p.trim() === `.${c}`)));

  const css = [
    '/* Généré par scripts/extraire-banque.mjs à partir de docs/banque-illustree.html. Ne pas modifier à la main. */',
    `.illu {\n${declarer(clair)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) .illu {\n${declarer(sombre).replace(/^/gm, '  ')}\n  }\n}`,
    `:root[data-theme="dark"] .illu {\n${declarer(sombre)}\n}`,
    '.illu .illu-svg { display: block; width: 100%; height: auto; }',
    ...regles.map((r) => `.illu ${r.selecteur.split(',').map((s) => s.trim()).join(', .illu ')} { ${renommer(r.corps)} }`),
    '',
  ].join('\n');
  return { css, nonCouvertes };
}

// ---------- Assemblage ----------

const md = trouverDoc("Banque d");
const html = trouverDoc('banque-illustree');
const { retenus, exclus } = lireMarkdown(md);
const cartes = lireCartes(html);

const avertissements = [];
const exercices = [];
const illustrations = {};

for (const ex of retenus) {
  const carte = cartes.get(ex.id);
  if (!carte) avertissements.push(`${ex.id} : aucune carte dans la page illustrée`);
  else if (carte.nom !== ex.nom) avertissements.push(`${ex.id} : nom différent dans la page illustrée (« ${carte.nom} »)`);
  exercices.push({
    ...ex,
    pourLeFrisbee: carte?.champs['Pour le frisbee'],
    video: carte?.video,
  });
  if (carte?.svg) illustrations[ex.id] = carte.svg;
}

for (const ex of exclus) {
  const carte = cartes.get(ex.id);
  if (!carte) avertissements.push(`${ex.id} (exclu) : aucune carte dans la page illustrée`);
  exercices.push({
    id: ex.id,
    type: ex.type,
    nom: ex.nom,
    statut: 'exclu',
    description: carte?.description ?? '',
    dosage: carte?.champs['Dosage'] ?? '',
    materiel: carte?.champs['Matériel'] ?? '',
    plusFacile: carte?.champs['Plus facile'] ?? '',
    plusDifficile: carte?.champs['Plus difficile'] ?? '',
    pourLeFrisbee: carte?.champs['Pour le frisbee'],
    video: carte?.video,
  });
  if (carte?.svg) illustrations[ex.id] = carte.svg;
}

for (const ex of exercices) if (!illustrations[ex.id]) avertissements.push(`${ex.id} : pas d'illustration`);

const { css, nonCouvertes } = construireCss(html, Object.values(illustrations));
for (const c of nonCouvertes) avertissements.push(`classe de dessin sans style : .${c}`);

const json = (o) => JSON.stringify(o, null, 2) + '\n';
writeFileSync(join(dossierSortie, 'banque.generated.json'), json({ exercices }));
writeFileSync(join(dossierSortie, 'illustrations.generated.json'), json(illustrations));
writeFileSync(join(dossierSortie, 'illustrations.generated.css'), css);

const compte = (s) => exercices.filter((e) => e.statut === s).length;
const poids = Object.values(illustrations).reduce((t, s) => t + Buffer.byteLength(s), 0);
console.log(
  `${exercices.length - compte('exclu')} retenus (${compte('valide')} validés, ${compte('a-essayer')} à essayer), ` +
    `${compte('exclu')} exclus, ${Object.keys(illustrations).length} illustrations (${(poids / 1024).toFixed(0)} Ko)`,
);
for (const a of avertissements) console.warn(`Attention : ${a}`);
