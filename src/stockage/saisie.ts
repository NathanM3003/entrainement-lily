// Saisie des résultats (Règles, section 5) : tout est prérempli avec ce qui était prévu.

import { exercice } from '../donnees/banque';
import type { Prescription, SeanceDetaillee, TypeBloc } from '../moteur/contenu';
import type { DateISO } from '../moteur/dates';
import type { Donnees, Douleurs, ResultatExercice, Unite, UniteAllure } from './types';

export type GenreSaisie = 'series' | 'sprints' | 'sauts' | 'efforts' | 'duree' | 'test' | 'case';

export const cleExercice = (bloc: TypeBloc, p: Prescription) => `${bloc}:${p.id}`;

/** Ce que Lily entre pour chaque type d'exercice (tableau « Saisie des résultats »). */
export function genreSaisie(bloc: TypeBloc, p: Prescription): GenreSaisie {
  if (bloc === 'echauffement') return 'case';
  switch (p.role) {
    case 'force-bas':
    case 'force-haut':
    case 'puissance':
    case 'tronc':
      return 'series';
    case 'freinage':
      return p.id === 'A1' ? 'sprints' : 'series';
    case 'acceleration':
    case 'vitesse-max':
      return 'sprints';
    case 'plio':
      return 'sauts';
    case 'intermittent':
      return 'efforts';
    case 'course':
    case 'cardio':
      return 'duree';
    case 'test':
      return 'test';
    default:
      return 'case'; // prévention, mobilité, éducatifs, agilité : fait ou pas fait
  }
}

/** Exercices sans charge (poids du corps). */
const SANS_CHARGE = new Set(['F13', 'F19', 'F20', 'F22', 'A2']);
export const avecCharge = (p: Prescription) => p.id === 'A3' || (p.id.startsWith('F') && !SANS_CHARGE.has(p.id) && !p.secondes);

/** Tests mesurés en charge. */
export const TESTS_CHARGE = new Set(['T-F1', 'T-F7', 'T-F14', 'T-F16']);

/** Dernière charge utilisée pour un exercice, dans une séance terminée avant cette date. */
export function derniereCharge(donnees: Donnees, id: string, avant: DateISO): { charge: number; unite: Unite } | undefined {
  const resultats = Object.values(donnees.resultats)
    .filter((r) => r.terminee && r.date < avant)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const r of resultats) {
    for (const [cle, ex] of Object.entries(r.exercices)) {
      if (cle.slice(cle.indexOf(':') + 1) !== id || ex.pasFait) continue;
      const charges = (ex.series ?? []).map((s) => s.charge).filter((c): c is number => typeof c === 'number' && c > 0);
      if (charges.length) return { charge: Math.max(...charges), unite: ex.unite ?? 'kg' };
    }
  }
  return undefined;
}

/** Résultat prérempli avec ce qui était prévu. Lily ne change que ce qui a été différent. */
export function preremplir(bloc: TypeBloc, p: Prescription, charge?: { charge: number; unite: Unite }): ResultatExercice {
  switch (genreSaisie(bloc, p)) {
    case 'series': {
      const n = p.series ?? 1;
      const serie = {
        ...(p.secondes ? { secondes: p.secondes.min } : { reps: p.reps?.min }),
        ...(avecCharge(p) && charge ? { charge: charge.charge } : {}),
      };
      return { series: Array.from({ length: n }, () => ({ ...serie })), ...(avecCharge(p) ? { unite: charge?.unite ?? 'kg' } : {}) };
    }
    case 'sprints':
      return { nombre: p.reps?.min ?? p.series ?? 1, distance: p.metres?.min };
    case 'sauts':
      return { nombre: p.sauts ?? (p.series ?? 1) * (p.reps?.min ?? 1) };
    case 'efforts':
      return { nombre: p.id === 'E7' ? 1 : (p.series ?? 1) * (p.reps?.min ?? 1) };
    case 'duree':
      return { minutes: p.minutes };
    case 'test':
      return TESTS_CHARGE.has(p.id) ? { unite: charge?.unite ?? 'kg' } : {};
    case 'case':
      return {};
  }
}

/** Notes de douleur demandées à la fin de la séance (section 5). */
export function douleursDemandees(seance: SeanceDetaillee): (keyof Douleurs)[] {
  const zones: (keyof Douleurs)[] = [];
  if (seance.contenu.course) zones.push('tibias', 'genou');
  const sauts = seance.contenu.blocs.some((b) => b.type === 'pliometrie' || b.type === 'agilite' || b.exercices.some((p) => p.id === 'T-saut' || p.id === 'T-saut-une-jambe'));
  if (sauts) zones.push('chevilles');
  return zones;
}

export const LIBELLES_DOULEURS: Record<keyof Douleurs, string> = {
  tibias: 'Tibias',
  genou: 'Arrière du genou',
  chevilles: 'Chevilles',
};

// ---------- Unités ----------

const LB_PAR_KG = 2.2046226218;

export function convertirCharge(charge: number, de: Unite, vers: Unite): number {
  if (de === vers) return charge;
  const v = de === 'kg' ? charge * LB_PAR_KG : charge / LB_PAR_KG;
  return Math.round(v * 2) / 2; // au demi près
}

/** « 60 kg (132,5 lb) » : l'app affiche les deux unités. */
export function texteCharge(charge: number, unite: Unite): string {
  const autre: Unite = unite === 'kg' ? 'lb' : 'kg';
  const f = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 1 });
  return `${f(charge)} ${unite} (${f(convertirCharge(charge, unite, autre))} ${autre})`;
}

const KM_PAR_MILLE = 1.609344;

/** Allure d'une course, dans l'unité choisie par Lily. */
export function texteAllure(minutes: number, km: number, unite: UniteAllure): string {
  if (!(minutes > 0 && km > 0)) return '';
  const kmh = km / (minutes / 60);
  if (unite === 'km/h') return `${kmh.toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km/h`;
  if (unite === 'mi/h') return `${(kmh / KM_PAR_MILLE).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} mi/h`;
  const minParKm = minutes / km;
  const m = Math.floor(minParKm);
  const s = Math.round((minParKm - m) * 60);
  return s === 60 ? `${m + 1}:00 min/km` : `${m}:${String(s).padStart(2, '0')} min/km`;
}

/** Distance du test de Cooper, en mètres, sur la piste de 460 m. */
export const LONGUEUR_PISTE = 460;
export const distanceCooper = (tours = 0, reste = 0) => tours * LONGUEUR_PISTE + reste;

export const nomExercice = (p: Prescription) => p.nom || exercice(p.id).nom;
