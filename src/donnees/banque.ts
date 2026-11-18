import donnees from './banque.generated.json';
import type { Exercice, ExerciceRetenu, TypeExercice } from './types';

export const exercices = donnees.exercices as Exercice[];

const parId = new Map(exercices.map((e) => [e.id, e]));

export function exercice(id: string): Exercice {
  const e = parId.get(id);
  if (!e) throw new Error(`Exercice inconnu : ${id}`);
  return e;
}

export const estRetenu = (e: Exercice): e is ExerciceRetenu => e.statut !== 'exclu';

export const exercicesRetenus = exercices.filter(estRetenu);

export const LIBELLES_TYPES: Record<TypeExercice, string> = {
  force: 'Force et puissance',
  vitesse: 'Vitesse',
  agilite: 'Agilité et changements de direction',
  pliometrie: 'Pliométrie',
  endurance: 'Endurance',
  prevention: 'Prévention et mobilité',
};

/** Les dessins sont chargés à part (environ 130 Ko) pour ne pas ralentir le premier affichage. */
export async function chargerIllustrations(): Promise<Record<string, string>> {
  const module = await import('./illustrations.generated.json');
  return { ...(module.default as Record<string, string>), ...ILLUSTRATIONS_ECHAUFFEMENT };
}

/** Bloc de 5 min, dans le style des dessins de course de la banque. */
const blocCinqMinutes = (nom: string, titre: string, legende: string) =>
  `<svg class="illu-svg" viewBox="0 0 320 200" role="img" aria-label="Illustration : ${nom}" xmlns="http://www.w3.org/2000/svg">` +
  `<rect class="bl" x="110" y="136" width="100" height="32" rx="1.5"/>` +
  `<line class="gd" x1="12" y1="170" x2="308" y2="170"/>` +
  `<text class="tx" x="160" y="126" text-anchor="middle">5 min</text>` +
  `<text class="tx" x="160" y="190" text-anchor="middle">${legende}</text>` +
  `<text class="tt" x="160" y="22" text-anchor="middle">${titre}</text></svg>`;

/** L'échauffement a ses propres dessins : ceux de E2 et E10 montrent la séance complète (20 à 40 min, intervalles). */
export const ILLUSTRATIONS_ECHAUFFEMENT: Record<string, string> = {
  'echauffement-E2': blocCinqMinutes('Jogging léger', '5 min de jogging léger', 'très facile : tu peux parler sans effort'),
  'echauffement-E10': blocCinqMinutes('Vélo ou rameur facile', '5 min de vélo ou rameur', 'très facile, pour te réchauffer'),
};
