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
  return module.default as Record<string, string>;
}
