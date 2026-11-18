// Contenu des séances (Règles du programme, sections 2, 3, 4, 6 et 7).
//
// À partir du plan d'une semaine (jours et types de séances), le moteur choisit les exercices,
// leur dosage et leur ordre : modèles de la section 7, rotation, prévention minimale, exercices
// « à essayer », semaines légères, coupes selon le nombre de matchs, blocs de changements de
// direction, affûtage, séances de tests, puis respect de la durée maximale.
//
// La progression (charges en kilos, étape de course, allures) vient plus tard (étape 5) :
// ici, le dosage est celui du modèle, avec le pourcentage du 1RM pour les mouvements testés.

import { exercice } from '../donnees/banque';
import type { Exercice, Statut } from '../donnees/types';
import { ajouterJours, dateCourte, lundiDe, type DateISO } from './dates';
import { INTERMITTENTS_MAX, niveauDe, type SerieEnPlus } from './progression';
import { dateDeblocage, restrictionsAu } from './restrictions';
import type { PlanSemaine, SeancePlanifiee } from './semaine';
import type { Calendrier, Phase, Semaine } from './types';

// ---------- Types ----------

export interface Fourchette {
  min: number;
  max: number;
}

export type Role =
  | 'echauffement'
  | 'agilite'
  | 'educatif'
  | 'acceleration'
  | 'vitesse-max'
  | 'freinage'
  | 'plio'
  | 'intermittent'
  | 'puissance'
  | 'force-bas'
  | 'force-haut'
  | 'tronc'
  | 'course'
  | 'cardio'
  | 'mobilite'
  | 'prevention'
  | 'test';

export interface Prescription {
  /** Numéro de la banque (F1, V5…) ou du test (T-saut…). */
  id: string;
  nom: string;
  /** Numéro de l'exercice dont on affiche le dessin. */
  illustration: string;
  role: Role;
  series?: number;
  reps?: Fourchette;
  secondes?: Fourchette;
  metres?: Fourchette;
  minutes?: number;
  parCote?: boolean;
  /** Unité des répétitions quand ce ne sont pas des répétitions (« haies », « appuis »). */
  unite?: string;
  /** Dosage écrit en toutes lettres quand il ne se résume pas à des séries et des répétitions. */
  format?: string;
  /** Mouvements testés (F1, F7, F14, F16) : charge de travail en % du 1RM estimé (section 7). */
  pourcentage1RM?: number;
  /** Première séance de la phase : −5 % (section 7, « Arrondi et sécurité »). */
  moinsCinqPourcent?: boolean;
  /** Dernière série « + » (section 5). */
  derniereSeriePlus?: boolean;
  /** Intensité maximale des sprints, en % (80 % jusqu'au 30 novembre). */
  intensite?: number;
  /** Allure en % de la VMA (section 7). */
  pctVMA?: Fourchette;
  allure?: string;
  /** Vitesse visée en km/h, tirée de la VMA (section 7). */
  vitesseKmh?: Fourchette;
  /** Récupération trottinée (40 à 50 % de la VMA), pour 15/15 et 30/30. */
  recuperationKmh?: Fourchette;
  /** Écart de plus de 10 % entre les côtés au dernier test : 1 série de plus du côté le plus faible. */
  serieEnPlus?: SerieEnPlus;
  /** Cardio sans impact qui remplace la course facile (douleur aux tibias ou au genou). */
  remplaceCourse?: boolean;
  /** Exercice « à essayer » : son remplacement est affiché à côté (section 6). */
  essai?: { remplacement?: string };
  note?: string;
  /** Tests : ce que Lily mesure. */
  mesure?: string;
  /** Nombre de sauts estimé (pliométrie). */
  sauts?: number;
  minutesEstimees: number;
  /**
   * Ordre de retrait si la séance dépasse la durée maximale : le plus grand part en premier.
   * 0 = jamais retiré (exercices principaux, prévention minimale, tests).
   */
  retrait: number;
}

export type TypeBloc =
  | 'echauffement'
  | 'agilite'
  | 'tests'
  | 'vitesse'
  | 'pliometrie'
  | 'intermittents'
  | 'force'
  | 'course'
  | 'cardio'
  | 'essai'
  | 'mobilite'
  | 'prevention';

export interface Bloc {
  type: TypeBloc;
  titre: string;
  exercices: Prescription[];
  minutes: number;
}

export interface ContenuSeance {
  blocs: Bloc[];
  /** Durée estimée, en minutes. */
  minutes: number;
  /** Nombre de sauts estimé. */
  sauts: number;
  /** La séance contient de la course (sprints, course facile, intermittents, tests de sprint ou de Cooper). */
  course: boolean;
  /** Exercice « à essayer » de la séance (au plus 1, sauf le bloc de S8 : voir plus bas). */
  essais: string[];
  messages: string[];
}

export type SeanceDetaillee = SeancePlanifiee & { contenu: ContenuSeance };

/** Ce que Lily a déjà fait ou décidé, qui change le contenu. Tout est facultatif. */
export interface EtatContenu {
  /** Statuts changés par Lily (« Je garde » → valide, « Je ne garde pas » → exclu, réglages). */
  statuts?: Record<string, Statut>;
  /** Nombre d'essais déjà faits avant cette semaine, par exercice « à essayer ». */
  essais?: Record<string, number>;
  /** Exercices pour lesquels Lily a choisi « Je réessaie une fois ». */
  reessais?: string[];
  /** Étape de la course facile en Fondation (1 à 7, section 5). Par défaut : 1. */
  etapeCourse?: number;
  /** Tibias calmes (douleur de 2 ou moins) : les foulées bondissantes (P7) sont permises. */
  tibiasCalmes?: boolean;
  /** Sprints en plus du bas de la fourchette (progression en volume, section 5). */
  sprintsEnPlus?: number;
  /** Tension derrière la cuisse ou le genou : pas de V3 ni de vitesse maximale jusqu'à cette date. */
  vitesseMaxEnPauseJusquau?: DateISO;
  /** Niveau de pliométrie permis (1 à 4). Par défaut : pas de limite. */
  niveauPlio?: number;
  /** Douleur de 5 ou plus depuis plus d'une semaine : course (tibias, genou) ou pliométrie (chevilles) en pause. */
  pauseCourse?: boolean;
  pausePlio?: boolean;
  /** La première course facile après cette date passe sur vélo ou rameur (douleur après la dernière course). */
  courseEnCardioApres?: DateISO;
  /** VMA en km/h (test demi-Cooper), pour traduire les allures. */
  vma?: number;
  /** Répétitions en plus par série, par format d'intermittent. */
  intermittentsEnPlus?: Record<string, number>;
  /** Séries en plus du côté le plus faible (F7, M1, P10). */
  seriesEnPlus?: Record<string, SerieEnPlus>;
}

export interface ContenuSemaine {
  seances: SeanceDetaillee[];
  messages: string[];
  /** Exercices « à essayer » prévus cette semaine (pour compter les essais des semaines suivantes). */
  essaisPrevus: string[];
  /** La course remplacée par du cardio après une douleur a été placée cette semaine. */
  courseEnCardioUtilisee: boolean;
}

// ---------- Constantes ----------

const TITRES: Record<TypeBloc, string> = {
  echauffement: 'Échauffement',
  agilite: 'Changements de direction',
  tests: 'Tests',
  vitesse: 'Vitesse',
  pliometrie: 'Pliométrie',
  intermittents: 'Intermittents',
  force: 'Force',
  course: 'Course facile',
  cardio: 'Cardio sans impact',
  essai: 'À essayer',
  mobilite: 'Mobilité',
  prevention: 'Prévention',
};

/** Ordre dans la séance (section 2) : échauffement, fraîcheur, force, course facile, prévention. */
const ORDRE_BLOCS: TypeBloc[] = [
  'echauffement',
  'agilite',
  'tests',
  'vitesse',
  'pliometrie',
  'intermittents',
  'force',
  'course',
  'cardio',
  'essai',
  'mobilite',
  'prevention',
];

/** Routine facultative de 10 min à la maison, les jours de repos (section 2). */
export const ROUTINE_MAISON = ['M1', 'M7', 'M3'] as const;
/** Routine d'avant-match de 10 min, à partir du 1er janvier (section 3). */
export const ROUTINE_AVANT_MATCH = ['A12', 'A4', 'P14', 'M1'] as const;

/** Force du bas du corps (coupes selon le nombre de matchs, section 4). */
const BAS_DU_CORPS = new Set(['F1', 'F2', 'F7', 'F8', 'F9', 'F10', 'F11', 'F25', 'F26', 'A3']);

const POURCENTAGE_1RM: Record<Phase, number | undefined> = {
  fondation: 70,
  'force-vitesse': 80,
  developpement: 80,
  maintien: 80,
  'puissance-repetition': 85,
  affutage: undefined, // la dernière charge lourde utilisée
};

const ETAPES_COURSE: { id: string; format: string; minutes: number }[] = [
  { id: 'E1', format: '5 × (3 min de course + 1 min de marche)', minutes: 20 },
  { id: 'E1', format: '5 × (4 min de course + 1 min de marche)', minutes: 25 },
  { id: 'E1', format: '4 × (6 min de course + 1 min de marche)', minutes: 28 },
  { id: 'E1', format: '2 × 12 min, 2 min de marche entre les deux', minutes: 26 },
  { id: 'E2', format: '20 min en continu', minutes: 20 },
  { id: 'E2', format: '25 min en continu', minutes: 25 },
  { id: 'E2', format: '30 min en continu', minutes: 30 },
];

/** Durée estimée des exercices de prévention, en minutes. */
const MINUTES_PREVENTION: Record<string, number> = { M1: 4, M7: 2, M8: 2, M10: 3, M3: 3, M11: 3, M20: 3 };

/** Au-delà d'environ 10 min, les exercices de prévention en plus du minimum alternent (section 7). */
const PREVENTION_MAX = 11;

// ---------- Fabrication des prescriptions ----------

const f = (min: number, max = min): Fourchette => ({ min, max });

type Options = Partial<Omit<Prescription, 'id' | 'role' | 'minutesEstimees'>>;

function px(id: string, role: Role, o: Options = {}): Prescription {
  const nom = id.startsWith('T-') ? '' : exercice(id).nom;
  return { id, nom, illustration: id, role, retrait: 0, minutesEstimees: 0, ...o };
}

/** Dosages de la banque utilisés tels quels (section « Banque d'exercices »). */
const DOSAGES: Record<string, Options & { role: Role; seriesMax?: number }> = {
  // Éducatifs
  V1: { role: 'educatif', series: 2, metres: f(15, 20) },
  V2: { role: 'educatif', series: 2, metres: f(20) },
  V3: { role: 'educatif', series: 2, metres: f(20) },
  V4: { role: 'educatif', format: '3 × 5 par jambe, puis 3 × 6 échanges' },
  // Pliométrie (bank)
  P1: { role: 'plio', series: 3, reps: f(15, 20) },
  P3: { role: 'plio', series: 3, reps: f(5) },
  P4: { role: 'plio', series: 3, seriesMax: 4, reps: f(4, 5) },
  P5: { role: 'plio', series: 3, seriesMax: 4, reps: f(4) },
  P6: { role: 'plio', series: 3, reps: f(5) },
  P9: { role: 'plio', series: 3, reps: f(5), unite: 'haies' },
  P13: { role: 'plio', series: 3, reps: f(5), parCote: true },
  P7: { role: 'plio', series: 3, reps: f(6, 8), unite: 'appuis' },
  P10: { role: 'plio', series: 3, reps: f(4), parCote: true },
  P11: { role: 'plio', series: 3, reps: f(8, 10), parCote: true },
  P12: { role: 'plio', series: 3, reps: f(3, 4), parCote: true },
  P14: { role: 'plio', series: 3, reps: f(5), parCote: true },
  P15: { role: 'plio', series: 3, secondes: f(10, 15) },
  // Tronc
  F19: { role: 'tronc', series: 3, secondes: f(30, 45) },
  F20: { role: 'tronc', series: 3, secondes: f(20, 40), parCote: true },
  F21: { role: 'tronc', series: 3, reps: f(10), parCote: true },
  F22: { role: 'tronc', series: 3, reps: f(8), parCote: true },
  F23: { role: 'tronc', series: 3, reps: f(10), parCote: true },
  // Prévention
  M1: { role: 'prevention', series: 3, reps: f(10, 15), parCote: true },
  M7: { role: 'prevention', series: 2, reps: f(15, 20) },
  M8: { role: 'prevention', format: '2 × 20 m sur les talons, puis 2 × 20 m sur les pointes' },
  M10: { role: 'prevention', series: 3, reps: f(8, 10) },
  M3: { role: 'prevention', series: 3, secondes: f(30), parCote: true },
  M11: { role: 'prevention', series: 2, secondes: f(15, 20), parCote: true },
  M20: { role: 'prevention', series: 2, reps: f(12, 15), parCote: true },
  // Mobilité
  M15: { role: 'mobilite', format: '5 par côté, ou 30 s', minutes: 3 },
  M16: { role: 'mobilite', format: '2 × 30 s par côté', minutes: 3 },
  M17: { role: 'mobilite', format: '8 par côté', minutes: 3 },
};

function dosage(id: string, o: Options = {}): Prescription {
  const d = DOSAGES[id];
  if (!d) throw new Error(`Pas de dosage pour ${id}`);
  const { role, seriesMax: _, ...reste } = d;
  return px(id, role, { ...reste, ...o });
}

/** Intermittents (section 5 « Intermittents », section 7 « Allures »). */
interface Intermittent {
  series: number;
  reps: Fourchette;
  effort: string;
  /** Durée d'une répétition (effort + récupération), en secondes. */
  cycle: number;
  pctVMA?: Fourchette;
  allure?: string;
}
const INTERMITTENTS: Record<string, Intermittent> = {
  E5: { series: 2, reps: f(8), effort: '15 s vite, 15 s en trottinant', cycle: 30, pctVMA: f(105) },
  E6: { series: 2, reps: f(6), effort: '30 s vite, 30 s en trottinant', cycle: 60, pctVMA: f(100) },
  E8: { series: 1, reps: f(8), effort: '30 s vite + 30 s de récupération, distance totale à battre', cycle: 60, pctVMA: f(100), allure: 'Au moins 100 % de la VMA' },
  E11: { series: 2, reps: f(6), effort: 'sprints de 20 à 30 m, 20 s de récupération', cycle: 25, allure: 'Sprint maximal' },
  E12: { series: 1, reps: f(6, 8), effort: '« points » : 1 min de 5 s de sprint et 10 s de jogging, puis 1 min 30 de repos', cycle: 150, allure: 'Sprint maximal' },
  E10: { series: 1, reps: f(10), effort: '30 s fort, 30 s facile, sur vélo ou rameur', cycle: 60 },
};

function intermittent(id: string, o: Options = {}): Prescription {
  if (id === 'E7') {
    return px('E7', 'intermittent', {
      format: 'Pyramide de 15, 30, 45, 60, 45, 30 et 15 s, récupération égale à l’effort',
      allure: '100 % de la VMA sur les efforts de 15 et 30 s, 95 % sur ceux de 45 et 60 s',
      pctVMA: f(95, 100),
      minutes: 8,
      ...o,
    });
  }
  const it = INTERMITTENTS[id];
  if (!it) throw new Error(`Intermittent inconnu : ${id}`);
  return px(id, 'intermittent', { series: it.series, reps: it.reps, format: it.effort, pctVMA: it.pctVMA, allure: it.allure, ...o });
}

function minutesIntermittent(p: Prescription): number {
  if (p.id === 'E7') return p.minutes ?? 8;
  const it = INTERMITTENTS[p.id];
  if (!it) return p.minutes ?? 10;
  const series = p.series ?? 1;
  return (series * (p.reps?.min ?? 1) * it.cycle) / 60 + (series - 1) * 3;
}

/** Durée estimée d'un exercice, en minutes (repos compris). */
function estimer(p: Prescription): number {
  const series = p.series ?? 1;
  const cote = p.parCote ? 1.25 : 1;
  switch (p.role) {
    case 'echauffement':
    case 'agilite':
    case 'course':
    case 'cardio':
    case 'mobilite':
    case 'test':
      return p.minutes ?? 0;
    case 'educatif':
      return 3;
    case 'acceleration':
      return (p.reps?.min ?? 4) * 1.5;
    case 'vitesse-max':
      return (p.reps?.min ?? 3) * 3.5;
    case 'freinage':
      return p.id === 'A1' ? (p.reps?.min ?? 4) : series * cote;
    case 'plio':
      return series * 1.3 * cote;
    case 'intermittent':
      return minutesIntermittent(p);
    case 'puissance':
      return series * 2;
    case 'force-bas':
    case 'force-haut':
      // Gros mouvement à la barre : repos de 2 à 3 min et séries de montée en charge.
      return p.id === 'F1' ? 3 + series * 3 : series * 2 * cote;
    case 'tronc':
      return series * 1.2 * cote;
    case 'prevention':
      return MINUTES_PREVENTION[p.id] ?? 3;
  }
}

function sauts(p: Prescription): number {
  if (p.role !== 'plio') return 0;
  const parSerie = p.reps ? p.reps.min : Math.round((p.secondes?.min ?? 0) * 1.5);
  return (p.series ?? 1) * parSerie * (p.parCote ? 2 : 1);
}

// ---------- Contexte d'une séance ----------

interface Ctx {
  cal: Calendrier;
  semaine: Semaine;
  seance: SeancePlanifiee;
  etat: EtatContenu;
  phase: Phase;
  /** Compteur de rotation : rang de la semaine normale dans la phase (gelé en semaine légère). */
  rot: number;
  legere: boolean;
  /** Matchs et jours de tournoi de la semaine. */
  nbMatchs: number;
  jourDeMatch: boolean;
  sansCourse: boolean;
  /** Exercice à essayer choisi pour cette séance. */
  essai?: string;
  /** Essais déjà faits ou prévus (avant cette séance). */
  essaisFaits: Map<string, number>;
  /** Partagé par les séances de la semaine : la course à remplacer par du cardio n'est pas encore placée. */
  reste: { cardio: boolean };
  /** Mini-retest de la semaine (S5) placé dans cette séance. */
  miniRetest?: boolean;
  messages: string[];
}

const r2 = (ctx: Ctx) => Math.floor(ctx.rot / 2); // rotation toutes les 2 semaines

export function statutDe(id: string, etat: EtatContenu): Statut {
  return etat.statuts?.[id] ?? exercice(id).statut;
}

function debloque(id: string, ctx: Ctx): boolean {
  const e = exercice(id);
  const date = dateDeblocage({ ...e, statut: 'valide' } as Exercice, ctx.cal.config);
  return date !== null && ctx.seance.date >= date;
}

/** Exercice validé, pas de réserve, et permis à la date de la séance. */
function dispo(id: string, ctx: Ctx): boolean {
  const e = exercice(id);
  if (statutDe(id, ctx.etat) !== 'valide') return false;
  if ('reserve' in e && e.reserve) return false;
  return debloque(id, ctx);
}

/** Pliométrie : seulement les niveaux déjà atteints (section 5, « Sauts »). */
const plioPermis = (id: string, ctx: Ctx) => dispo(id, ctx) && niveauDe(id) <= (ctx.etat.niveauPlio ?? 4);

function tourner<T>(liste: T[], k: number): T[] {
  if (liste.length === 0) return liste;
  const d = ((k % liste.length) + liste.length) % liste.length;
  return [...liste.slice(d), ...liste.slice(0, d)];
}

function choisir(ids: string[], k: number, ctx: Ctx): string | undefined {
  return tourner(
    ids.filter((id) => dispo(id, ctx)),
    k,
  )[0];
}

function plusieurs(ids: string[], n: number, k: number, ctx: Ctx): string[] {
  const pool = ids.filter((id) => dispo(id, ctx));
  return tourner(pool, n * k).slice(0, n);
}

const remplacementDe = (id: string): string | undefined => {
  const e = exercice(id);
  return 'remplacements' in e ? e.remplacements?.[0] : undefined;
};

/** Marque une prescription comme exercice à essayer. */
function enEssai(p: Prescription): Prescription {
  return { ...p, essai: { remplacement: remplacementDe(p.id) } };
}

// ---------- Exercices « à essayer » (section 6) ----------

/** Fenêtre d'essai : F17, F21, F23 et M20 de S1 à S3 ; E3 une fois en Fondation. A8 et A9 : bloc de S8 (plus bas). */
const ESSAIS_DEBUT = ['F17', 'F21', 'F23', 'M20'];
const SEMAINES_ESSAIS_DEBUT = 3;

function peutEssayer(id: string, ctx: Ctx): boolean {
  if (statutDe(id, ctx.etat) !== 'a-essayer' || !debloque(id, ctx)) return false;
  if (ctx.legere || ctx.phase === 'affutage' || ctx.jourDeMatch || ctx.seance.test) return false; // aucun nouvel exercice
  const faits = ctx.essaisFaits.get(id) ?? 0;
  if ((ctx.etat.reessais ?? []).includes(id)) return faits < 2;
  if (faits > 0) return false;
  if (ESSAIS_DEBUT.includes(id)) return ctx.semaine.numero <= SEMAINES_ESSAIS_DEBUT;
  if (id === 'E3') return ctx.phase === 'fondation';
  return false;
}

/** Places possibles pour un essai dans chaque séance (le remplacement occupe la même place). */
function candidatsEssai(ctx: Ctx): string[] {
  const { type } = ctx.seance;
  const phase = ctx.phase;
  if (type === 'C' || type === 'D') {
    const liste = ['F17', 'F21', 'F23', 'M20'];
    if (type === 'C' && phase === 'fondation') liste.push('E3');
    return liste;
  }
  if (type === 'B' && phase === 'puissance-repetition') return ['F17'];
  return [];
}

// ---------- Blocs communs ----------

type Item = { bloc: TypeBloc; p: Prescription };
const item = (bloc: TypeBloc, p: Prescription | undefined): Item[] => (p ? [{ bloc, p }] : []);

function echauffement(ctx: Ctx, avecCourse: boolean, avecSauts: boolean): Item[] {
  const e = (id: string, o: Options) => ({ bloc: 'echauffement' as const, p: px(id, 'echauffement', o) });
  const items: Item[] = [
    avecCourse
      ? e('E2', { nom: 'Jogging léger', format: '5 min', minutes: 5 })
      : e('E10', { nom: 'Vélo ou rameur, facile', format: '5 min', minutes: 5 }),
    e('M14', { format: '5 par côté', minutes: 1.25 }),
    e('M18', { format: '10 par direction, par jambe', minutes: 1.25 }),
    e('M19', { format: '5 répétitions', minutes: 1.25 }),
    e('M5', { format: '2 × 10 par côté', minutes: 1.25 }),
    e('M12', { format: '2 × 10 pas par côté', minutes: 1.5 }),
  ];
  if (avecSauts) items.push(e('P1', { format: 'Quelques sauts légers', minutes: 1.5 }));
  if (avecCourse) items.push(e('V8', { format: '3 accélérations progressives', minutes: 2 }));
  return items;
}

/** Prévention : le minimum de la section 7, plus les exercices de la liste du modèle. */
function prevention(ctx: Ctx, liste: string[], course: boolean): Item[] {
  const minimum = ['M1', ...(course ? ['M7', 'M8'] : []), ...(ctx.seance.type === 'B' ? ['M10'] : [])];
  const items: Prescription[] = minimum.filter((id) => dispo(id, ctx)).map((id) => dosage(id));
  // M7 et M8 vont avec la course : sans course (vélo, jour de match, 2 matchs), ils ne sont pas ajoutés.
  const enPlus = liste.filter((id) => !minimum.includes(id) && (course || (id !== 'M7' && id !== 'M8')));
  const possibles = enPlus.filter((id) => dispo(id, ctx) || (id === ctx.essai && id === 'M20'));
  const total = (ps: Prescription[]) => ps.reduce((t, p) => t + estimer(p), 0);
  let gardes = possibles;
  if (total([...items, ...possibles.map((id) => dosage(id))]) > PREVENTION_MAX && possibles.length > 0) {
    // Au-delà d'environ 10 min, les exercices en plus alternent d'une séance à l'autre.
    const essai = possibles.find((id) => id === ctx.essai);
    gardes = essai ? [essai] : ctx.semaine.numero % 2 === 1 ? [possibles[0]!] : possibles.length > 1 ? [possibles[1]!] : [];
  }
  for (const id of gardes) {
    const p = dosage(id, { retrait: 9 });
    items.push(id === ctx.essai ? enEssai({ ...p, retrait: 4 }) : p);
  }
  return items.map((p) => ({ bloc: 'prevention', p }));
}

function courseFacile(ctx: Ctx): Item[] {
  if (ctx.sansCourse) return cardioSansImpact(ctx);
  const etape = ETAPES_COURSE[Math.min(7, Math.max(1, ctx.etat.etapeCourse ?? 1)) - 1]!;
  // Douleur après la dernière course (section 5) : la course suivante devient du cardio sans impact.
  const apresDouleur = ctx.etat.courseEnCardioApres && ctx.seance.date > ctx.etat.courseEnCardioApres && ctx.reste.cardio;
  if (ctx.etat.pauseCourse || apresDouleur) {
    if (apresDouleur) {
      ctx.reste.cardio = false;
      ctx.messages.push('Course remplacée par du cardio sans impact : douleur après la dernière course. La course reprend la fois suivante.');
    }
    return cardioSansImpact(ctx, etape.minutes).map((it) => ({ ...it, p: { ...it.p, remplaceCourse: true } }));
  }
  return item(
    'course',
    px(etape.id, 'course', {
      format: `Étape ${ETAPES_COURSE.indexOf(etape) + 1} : ${etape.format}`,
      minutes: etape.minutes,
      pctVMA: f(60, 70),
      allure: 'Allure facile : elle peut parler',
    }),
  );
}

/** Cardio sans impact : E3 s'il est adopté, sinon E10 (sections 2 et 5). */
function cardioSansImpact(ctx: Ctx, minutes = 20): Item[] {
  if (dispo('E3', ctx)) return item('cardio', px('E3', 'cardio', { format: `${minutes} min à effort modéré`, minutes }));
  return item('intermittents', intermittent('E10'));
}

/** Tronc : n exercices parmi F19 à F23, qui alternent toutes les 2 semaines. */
function tronc(ctx: Ctx, n: number): Item[] {
  const ids = plusieurs(['F19', 'F20', 'F21', 'F22', 'F23'], n, r2(ctx), ctx);
  const essai = ctx.essai === 'F21' || ctx.essai === 'F23' ? ctx.essai : undefined;
  if (essai) {
    const i = ids.indexOf(remplacementDe(essai) ?? '');
    ids.splice(i >= 0 ? i : Math.max(0, ids.length - 1), ids.length ? 1 : 0, essai);
  }
  return ids.map((id, i) => {
    const p = dosage(id, { retrait: i === 0 ? 4 : 7 });
    return { bloc: 'force' as const, p: id === essai ? enEssai(p) : p };
  });
}

/** Mouvement testé : charge en % du 1RM estimé. */
function teste(ctx: Ctx, id: string, role: Role, series: number, reps: Fourchette, o: Options = {}): Prescription {
  return px(id, role, {
    series,
    reps,
    // Phase Puissance : F14 et F16 sont en 6 à 8 répétitions, 80 % (décision du 18 novembre 2026).
    pourcentage1RM: ctx.phase === 'puissance-repetition' && (id === 'F14' || id === 'F16') ? 80 : POURCENTAGE_1RM[ctx.phase],
    derniereSeriePlus: true,
    parCote: id === 'F7',
    ...o,
  });
}

const accessoire = (id: string, role: Role, series: number, reps: Fourchette, o: Options = {}): Prescription =>
  px(id, role, { series, reps, derniereSeriePlus: true, ...o });

/** Tirage ou F17 : place de l'essai de F17 (son remplacement est F16). */
function tirage(ctx: Ctx, options: string[], reps: Fourchette, retrait: number): Item[] {
  if (ctx.essai === 'F17') return item('force', enEssai(accessoire('F17', 'force-haut', 3, reps, { parCote: true, retrait })));
  const id = choisir(options, r2(ctx), ctx);
  if (!id) return [];
  return item('force', accessoire(id, 'force-haut', 3, reps, { parCote: id === 'F17', retrait }));
}

/** F18, ou M20 pendant son essai (M20 remplace F18 s'il est refusé). */
function tirageVisage(ctx: Ctx): Item[] {
  if (ctx.essai === 'M20') return item('force', enEssai(dosage('M20', { retrait: 4 })));
  return dispo('F18', ctx) ? item('force', accessoire('F18', 'force-haut', 3, f(12, 15), { retrait: 4 })) : [];
}

/** Pliométrie : on ajoute des exercices (rotation chaque semaine) jusqu'à la fourchette de sauts. */
function remplirSauts(ctx: Ctx, groupes: string[][], cible: Fourchette, maxExercices: number): Prescription[] {
  const choisis: Prescription[] = [];
  let total = 0;
  for (const groupe of groupes) {
    for (const id of tourner(
      groupe.filter((g) => plioPermis(g, ctx)),
      ctx.rot,
    )) {
      if (choisis.length >= maxExercices || total >= cible.min) break;
      const p = dosage(id);
      const n = sauts(p);
      if (total + n > cible.max) continue;
      choisis.push(p);
      total += n;
    }
  }
  // Encore trop peu : on monte au nombre de séries le plus haut de la banque (P4, P5).
  for (const p of choisis) {
    const max = DOSAGES[p.id]?.seriesMax;
    if (total < cible.min && max && p.series && max > p.series) {
      const avant = sauts(p);
      const plus = { ...p, series: max };
      if (total - avant + sauts(plus) <= cible.max) {
        Object.assign(p, plus);
        total += sauts(plus) - avant;
      }
    }
  }
  return choisis;
}

const SPRINTS: Record<string, Fourchette> = { V5: f(10), V6: f(10, 20), V7: f(10), V9: f(10, 20), V11: f(30, 40) };
const sprint = (id: string, role: Role, reps: Fourchette, o: Options = {}) => px(id, role, { reps, metres: SPRINTS[id], ...o });

function educatifs(ctx: Ctx): Item[] {
  return plusieurs(['V1', 'V2', 'V3', 'V4'], 2, ctx.rot, ctx).map((id, i) => ({ bloc: 'vitesse' as const, p: dosage(id, { retrait: i === 0 ? 5 : 6 }) }));
}

// ---------- Tests (Profil, « Tests de référence » ; Règles, section 6) ----------

const TESTS: Record<string, { nom: string; illustration: string; mesure: string; minutes: number; parCote?: boolean; format: string }> = {
  'T-cheville': {
    nom: 'Flexion de cheville vers le mur',
    illustration: 'M5',
    mesure: 'cm',
    minutes: 5,
    parCote: true,
    format: 'Distance orteil-mur maximale, genou au mur, talon au sol. Meilleur de 3 essais.',
  },
  'T-saut': {
    nom: 'Saut en longueur sans élan',
    illustration: 'P5',
    mesure: 'cm',
    minutes: 5,
    format: 'Mesurer jusqu’au talon le plus proche. Meilleur de 3 essais, 1 min de repos.',
  },
  'T-saut-une-jambe': {
    nom: 'Saut sur une jambe',
    illustration: 'P10',
    mesure: 'cm',
    minutes: 5,
    parCote: true,
    format: 'Réception tenue sur la même jambe. Meilleur de 3 essais.',
  },
  'T-sprint-10': {
    nom: 'Sprint 10 m',
    illustration: 'V6',
    mesure: 's',
    minutes: 6,
    format: 'Départ debout, filmer l’arrivée au ralenti. 3 essais, 2 à 3 min de récupération.',
  },
  'T-sprint-20': {
    nom: 'Sprint 20 m',
    illustration: 'V6',
    mesure: 's',
    minutes: 6,
    format: '3 essais, 2 à 3 min de récupération.',
  },
  'T-F1': { nom: 'Squat arrière à la barre', illustration: 'F1', mesure: 'kg', minutes: 10, format: 'Charge pour 5 répétitions propres, 1 en réserve.' },
  'T-F7': {
    nom: 'Squat bulgare',
    illustration: 'F7',
    mesure: 'kg',
    minutes: 10,
    parCote: true,
    format: 'Charge pour 5 répétitions propres, 1 en réserve, chaque côté.',
  },
  'T-F14': { nom: 'Développé des épaules aux haltères', illustration: 'F14', mesure: 'kg', minutes: 6, format: 'Charge pour 5 répétitions propres, 1 en réserve.' },
  'T-F16': { nom: 'Tirage horizontal à la poulie', illustration: 'F16', mesure: 'kg', minutes: 6, format: 'Charge pour 5 répétitions propres, 1 en réserve.' },
  'T-mollet': {
    nom: 'Mollet sur une jambe, maximum de répétitions',
    illustration: 'M1',
    mesure: 'répétitions',
    minutes: 6,
    parCote: true,
    format: '1 s pour monter, 1 s pour descendre. Arrêter quand l’amplitude diminue.',
  },
  'T-cooper': {
    nom: 'Test demi-Cooper (6 min)',
    illustration: 'E9',
    mesure: 'm',
    minutes: 9,
    format: 'Courir le plus loin possible en 6 min sur la piste de 460 m. Noter les tours et le dernier tour partiel.',
  },
};

function test(id: string): Prescription {
  const t = TESTS[id]!;
  return px(id, 'test', { nom: t.nom, illustration: t.illustration, mesure: t.mesure, minutes: t.minutes, parCote: t.parCote, format: t.format });
}

const sprint100Permis = (ctx: Ctx) => restrictionsAu(ctx.cal.config, ctx.seance.date).intensiteSprint >= 100;

/** Journée 1 : du moins fatigant au plus fatigant (Profil). Remplace la séance A. */
function seanceJournee1(ctx: Ctx): Item[] {
  const retest = ctx.semaine.retests.find((r) => r.type === 'journee1');
  const avecSprint = !retest?.sansSprint && sprint100Permis(ctx);
  const ids = [
    'T-cheville',
    'T-saut',
    ...(retest?.avecSautUneJambe ? ['T-saut-une-jambe'] : []),
    ...(avecSprint ? ['T-sprint-10', 'T-sprint-20'] : []),
    'T-F1',
    'T-F7',
    'T-F14',
    'T-F16',
    'T-mollet',
  ];
  // Le test du mollet est le mouvement de M1, poussé au maximum : M1 n'est pas refait après.
  const prev = avecSprint ? ['M7', 'M8'].filter((id) => dispo(id, ctx)).map((id) => ({ bloc: 'prevention' as const, p: dosage(id) })) : [];
  return [...echauffement(ctx, true, true), ...ids.map((id) => ({ bloc: 'tests' as const, p: test(id) })), ...prev];
}

// ---------- Modèles des séances (section 7) ----------

function fondation(ctx: Ctx): Item[] {
  const { type, deuxSeances } = ctx.seance;
  if (type === 'A') {
    const testSprint = ctx.seance.test === 'sprint' && sprint100Permis(ctx);
    const acc = choisir(['V5', 'V6', 'V7'], ctx.rot, ctx);
    return [
      ...educatifs(ctx),
      ...(testSprint
        ? [test('T-sprint-10'), test('T-sprint-20')].map((p) => ({ bloc: 'vitesse' as const, p }))
        : item('vitesse', acc ? sprint(acc, 'acceleration', f(4, 8)) : undefined)),
      ...item('vitesse', dispo('A1', ctx) ? px('A1', 'freinage', { reps: f(4), metres: f(10, 15), retrait: 6 }) : undefined),
      ...courseFacile(ctx),
      ...prevention(ctx, ['M1', 'M7', 'M8'], true),
    ];
  }
  if (type === 'B') {
    const plio = remplirSauts(ctx, [[choisir(['P1', 'P3'], ctx.rot, ctx) ?? 'P1'], ['P4', 'P5', 'P6', 'P9', 'P13']], f(40, 60), 3);
    return [
      ...plio.map((p) => ({ bloc: 'pliometrie' as const, p })),
      ...item('pliometrie', dispo('A2', ctx) ? px('A2', 'freinage', { series: 3, reps: f(5), retrait: 6 }) : undefined),
      ...item('force', teste(ctx, 'F1', 'force-bas', 3, f(8, 10))),
      ...item('force', teste(ctx, 'F7', 'force-bas', 3, f(8))),
      ...item('force', accessoire('F9', 'force-bas', 3, f(8), { parCote: true })),
      ...item('force', accessoire('F10', 'force-bas', 3, f(10, 12))),
      ...item('force', dispo('A3', ctx) ? px('A3', 'freinage', { series: 3, reps: f(6), parCote: true, retrait: 6 }) : undefined),
      // Fondation à 2 séances : « pliométrie + force complète » (section 2).
      ...(deuxSeances ? [teste(ctx, 'F14', 'force-haut', 3, f(8, 10)), teste(ctx, 'F16', 'force-haut', 3, f(8, 10))].map((p) => ({ bloc: 'force' as const, p })) : []),
      ...prevention(ctx, ['M1', 'M10', 'M3'], false),
    ];
  }
  if (type === 'C') {
    const essaiE3 = ctx.essai === 'E3' ? item('essai', enEssai(px('E3', 'cardio', { format: '10 min à effort modéré, à la fin de la séance', minutes: 10, retrait: 5 }))) : [];
    return [
      ...item('force', teste(ctx, 'F14', 'force-haut', 3, f(8, 10))),
      ...item('force', teste(ctx, 'F16', 'force-haut', 3, f(8, 10))),
      ...tirageOuPompes(ctx, f(8, 10)),
      ...tirageVisage(ctx),
      ...tronc(ctx, 2),
      ...courseFacile(ctx),
      ...essaiE3,
      ...prevention(ctx, ['M1', 'M7', 'M8'], !ctx.sansCourse),
    ];
  }
  return seanceD(ctx);
}

/** « F13 ou F17 » (Fondation C) : place de l'essai de F17. */
function tirageOuPompes(ctx: Ctx, reps: Fourchette): Item[] {
  if (ctx.essai === 'F17') return item('force', enEssai(accessoire('F17', 'force-haut', 3, reps, { parCote: true, retrait: 4 })));
  const id = choisir(['F13', 'F17'], r2(ctx), ctx);
  return id ? item('force', accessoire(id, 'force-haut', 3, reps, { parCote: id === 'F17', retrait: 4 })) : [];
}

function seanceD(ctx: Ctx): Item[] {
  const cardio = ctx.jourDeMatch
    ? []
    : ctx.phase === 'fondation'
      ? cardioSansImpact(ctx) // E3 continu s'il est adopté, sinon E10
      : item('intermittents', intermittent('E10'));
  return [
    ...cardio,
    ...item('force', dispo('F13', ctx) ? accessoire('F13', 'force-haut', 3, f(8, 10), { retrait: 4 }) : undefined),
    ...tirage(ctx, ['F16', 'F17'], f(8, 10), 4),
    ...tirageVisage(ctx),
    ...tronc(ctx, 2),
    ...prevention(ctx, ['M1'], false),
  ];
}

function forceVitesse(ctx: Ctx): Item[] {
  const { type } = ctx.seance;
  if (type === 'A') {
    const acc = choisir(['V5', 'V6', 'V7'], ctx.rot, ctx);
    const max = choisir(['V9', 'V11'], ctx.rot, ctx);
    const acc2 = choisir(['F2', 'F11'], r2(ctx), ctx);
    return [
      ...educatifs(ctx),
      ...item('vitesse', acc ? sprint(acc, 'acceleration', f(6, 8)) : undefined),
      ...item('vitesse', max ? sprint(max, 'vitesse-max', f(3, 5)) : undefined),
      ...item('force', teste(ctx, 'F1', 'force-bas', 4, f(4, 6))),
      ...item('force', accessoire('F10', 'force-bas', 3, f(10, 12))),
      ...item('force', acc2 ? accessoire(acc2, 'force-bas', 3, f(8, 10), { retrait: 3 }) : undefined),
      ...prevention(ctx, ['M1', 'M7', 'M8'], true),
    ];
  }
  if (type === 'B') {
    const niveau3 = ['P10', 'P11', 'P12', ...(ctx.etat.tibiasCalmes ? ['P7'] : [])];
    const plio = remplirSauts(ctx, [niveau3, ['P4', 'P5', 'P6', 'P9', 'P13']], f(50, 70), 3);
    return [
      ...plio.map((p) => ({ bloc: 'pliometrie' as const, p })),
      ...item('force', teste(ctx, 'F7', 'force-bas', 4, f(4, 6))),
      ...item('force', accessoire('F9', 'force-bas', 3, f(8), { parCote: true })),
      ...item('force', dispo('F8', ctx) ? accessoire('F8', 'force-bas', 3, f(8), { parCote: true, retrait: 3 }) : undefined),
      ...item('force', teste(ctx, 'F14', 'force-haut', 4, f(4, 6))),
      ...item('force', teste(ctx, 'F16', 'force-haut', 4, f(4, 6))),
      ...prevention(ctx, ['M1', 'M10'], false),
    ];
  }
  if (type === 'C') {
    const format = choisir(['E5', 'E6', 'E8'], ctx.rot, ctx);
    const deuxMatchs = ctx.nbMatchs >= 2;
    return [
      ...(deuxMatchs ? [] : ctx.sansCourse ? item('intermittents', intermittent('E10')) : item('intermittents', format ? intermittent(format) : undefined)),
      ...item('force', dispo('F13', ctx) ? accessoire('F13', 'force-haut', 3, f(8, 10), { retrait: 4 }) : undefined),
      ...tirage(ctx, ['F17', 'F16'], f(8, 10), 4),
      ...tirageVisage(ctx),
      ...tronc(ctx, 2),
      ...(deuxMatchs || ctx.sansCourse ? [] : item('course', px('E2', 'course', { format: '10 min', minutes: 10, pctVMA: f(60, 70), allure: 'Allure facile' }))),
      ...prevention(ctx, ['M1', 'M7', 'M8'], !deuxMatchs && !ctx.sansCourse),
    ];
  }
  return seanceD(ctx);
}

function puissanceRepetition(ctx: Ctx): Item[] {
  const { type } = ctx.seance;
  if (type === 'A') {
    const max = choisir(['V9', 'V11'], ctx.rot, ctx);
    return [
      ...item('vitesse', max ? sprint(max, 'vitesse-max', f(3, 5)) : undefined),
      ...item('vitesse', sprint('V6', 'acceleration', f(3, 4))),
      ...item('force', px('F25', 'puissance', { series: 4, reps: f(4, 5), note: 'En premier' })),
      ...item('force', teste(ctx, 'F1', 'force-bas', 3, f(3, 5))),
      ...item('force', px('F26', 'puissance', { series: 4, reps: f(8, 10), retrait: 3 })),
      ...item('force', accessoire('F10', 'force-bas', 3, f(8, 10))),
      ...prevention(ctx, ['M1', 'M7', 'M8'], true),
    ];
  }
  if (type === 'B') {
    const cote = choisir(['P14', 'P15'].filter((id) => plioPermis(id, ctx)), ctx.rot, ctx);
    const uneJambe = choisir(['P10', 'P11', 'P12'].filter((id) => plioPermis(id, ctx)), ctx.rot, ctx);
    // Niveau 4 (de côté) pas encore atteint : on reste aux niveaux permis, dans la même fourchette de sauts.
    const plio =
      cote && uneJambe
        ? [dosage(cote), dosage(uneJambe)]
        : remplirSauts(ctx, [['P10', 'P11', 'P12', 'P14', 'P15'], ['P4', 'P5', 'P6', 'P9', 'P13']], f(60, 80), 3);
    return [
      ...plio.map((p) => ({ bloc: 'pliometrie' as const, p })),
      ...item('force', teste(ctx, 'F7', 'force-bas', 3, f(4, 6))),
      ...item('force', accessoire('F9', 'force-bas', 3, f(6), { parCote: true })),
      ...item('force', teste(ctx, 'F14', 'force-haut', 3, f(6, 8))),
      ...(ctx.essai === 'F17'
        ? item('force', enEssai(accessoire('F17', 'force-haut', 3, f(6, 8), { parCote: true })))
        : (() => {
            const id = choisir(['F16', 'F17'], r2(ctx), ctx);
            if (!id) return [];
            return item('force', id === 'F16' ? teste(ctx, 'F16', 'force-haut', 3, f(6, 8)) : accessoire('F17', 'force-haut', 3, f(6, 8), { parCote: true }));
          })()),
      ...prevention(ctx, ['M1', 'M10', 'M11'], false),
    ];
  }
  if (type === 'C') {
    const deuxMatchs = ctx.nbMatchs >= 2;
    const format = choisir(['E11', 'E12', 'E7'], ctx.rot, ctx);
    return [
      ...(deuxMatchs ? [] : ctx.sansCourse ? item('intermittents', intermittent('E10')) : item('intermittents', format ? intermittent(format) : undefined)),
      // 2 matchs : « C devient force du haut du corps + tronc, sans course » (section 4).
      ...(deuxMatchs
        ? [...item('force', dispo('F13', ctx) ? accessoire('F13', 'force-haut', 3, f(8, 10), { retrait: 4 }) : undefined), ...tirage(ctx, ['F16', 'F17'], f(8, 10), 4)]
        : []),
      ...tronc(ctx, 3),
      ...(dispo('F18', ctx) ? item('force', accessoire('F18', 'force-haut', 3, f(12, 15), { retrait: 4 })) : []),
      ...prevention(ctx, ['M1', 'M20', 'M7', 'M8'], !deuxMatchs && !ctx.sansCourse),
    ];
  }
  return seanceD(ctx);
}

/** Séance unique : vitesse + force complète (squat, squat bulgare, tirage, développé), environ 1 h. */
function seanceUnique(ctx: Ctx): Item[] {
  const p2 = ctx.phase !== 'fondation';
  const acc = choisir(p2 ? ['V6'] : ['V5', 'V6', 'V7'], ctx.rot, ctx);
  const max = p2 ? choisir(['V9', 'V11'], ctx.rot, ctx) : undefined;
  const reps = ctx.phase === 'fondation' ? f(8, 10) : ctx.phase === 'puissance-repetition' ? f(3, 5) : f(4, 6);
  return [
    ...item('vitesse', max ? sprint(max, 'vitesse-max', f(3, 5)) : undefined),
    ...item('vitesse', acc ? sprint(acc, 'acceleration', p2 ? f(3, 4) : f(4, 8)) : undefined),
    ...item('force', teste(ctx, 'F1', 'force-bas', 3, reps)),
    ...item('force', teste(ctx, 'F7', 'force-bas', 3, ctx.phase === 'fondation' ? f(8) : reps)),
    ...item('force', teste(ctx, 'F16', 'force-haut', 3, ctx.phase === 'fondation' ? f(8, 10) : f(6, 8))),
    ...item('force', teste(ctx, 'F14', 'force-haut', 3, ctx.phase === 'fondation' ? f(8, 10) : f(6, 8))),
    ...prevention(ctx, ['M1', 'M7', 'M8'], true),
  ];
}

/** Affûtage (section 2) : environ 40 % de volume en moins, mêmes charges et même vitesse. */
function affutage(ctx: Ctx): Item[] {
  const { type } = ctx.seance;
  const lourd = { note: 'À sa charge lourde habituelle', derniereSeriePlus: false };
  if (type === 'A' || type === 'U') {
    const items: Item[] = [
      ...item('vitesse', sprint('V6', 'acceleration', f(3, 4), { note: 'À 100 %, récupération complète' })),
      ...item('vitesse', dispo('V9', ctx) ? sprint('V9', 'vitesse-max', f(2)) : undefined),
      ...item('force', px('F1', 'force-bas', { series: 2, reps: f(3), format: '2 ou 3 séries de 3', ...lourd })),
      ...item('force', accessoire('F10', 'force-bas', 2, f(8))),
    ];
    if (type === 'U') {
      items.push(
        ...item('force', px('F7', 'force-bas', { series: 2, reps: f(5), parCote: true, ...lourd })),
        ...item('force', accessoire('F16', 'force-haut', 2, f(8))),
        ...item('force', accessoire('F14', 'force-haut', 2, f(8))),
      );
    }
    return [...items, ...prevention(ctx, ['M1', 'M7', 'M8'], true)];
  }
  if (type === 'B') {
    return [
      ...item('pliometrie', px('P4', 'plio', { series: 3, reps: f(3) })),
      ...item('pliometrie', plioPermis('P14', ctx) ? px('P14', 'plio', { series: 2, reps: f(4), parCote: true }) : undefined),
      ...item('force', px('F7', 'force-bas', { series: 2, reps: f(5), parCote: true, ...lourd })),
      ...item('force', accessoire('F16', 'force-haut', 2, f(8))),
      ...item('force', accessoire('F14', 'force-haut', 2, f(8))),
      ...prevention(ctx, ['M1', 'M10'], false),
    ];
  }
  if (type === 'C') {
    return [
      ...(ctx.sansCourse ? item('intermittents', intermittent('E10', { reps: f(6) })) : item('intermittents', dispo('E12', ctx) ? intermittent('E12', { reps: f(4) }) : undefined)),
      ...['M15', 'M16', 'M17'].filter((id) => dispo(id, ctx)).map((id) => ({ bloc: 'mobilite' as const, p: dosage(id) })),
      ...prevention(ctx, ['M1', 'M7', 'M8'], !ctx.sansCourse),
    ];
  }
  // D : la séance D habituelle, avec 1 série de moins (environ 40 % de volume en moins).
  return seanceD(ctx).map((it) => ({ ...it, p: uneSerieDeMoins(it.p) }));
}

/** Test demi-Cooper : remplace la séance C. Le reste de C (force et tronc) suit le test. */
function seanceCooper(ctx: Ctx): Item[] {
  const sansCourse = { ...ctx, sansCourse: true }; // le contenu de C, sans sa partie course
  const reste = (ctx.phase === 'fondation' ? fondation(sansCourse) : ctx.phase === 'puissance-repetition' ? puissanceRepetition(sansCourse) : forceVitesse(sansCourse)).filter(
    (it) => it.bloc === 'force',
  );
  return [{ bloc: 'tests', p: test('T-cooper') }, ...reste, ...prevention(ctx, ['M1', 'M7', 'M8'], true)];
}

// ---------- Changements de direction (section 3) ----------

/**
 * Étape du retour des changements de direction :
 * 1 = les 10 premiers jours (S6 et S7), dans toutes les séances ;
 * 2 = la semaine suivante (S8), séance B ;
 * 3 = la semaine d'après (S9), séance B ;
 * 4 = ensuite : bloc d'appoint, seulement les semaines sans match.
 */
function etapeChangementsDeDirection(ctx: Ctx): 0 | 1 | 2 | 3 | 4 {
  const cod = ctx.cal.config.restrictions.changementsDeDirection;
  if (!cod) return 4;
  const retour = ajouterJours(cod.jusquau, 1);
  const date = ctx.seance.date;
  if (date < retour) return 0;
  if (date <= ajouterJours(retour, 9)) return 1;
  const lundi2 = lundiDe(ajouterJours(retour, 10));
  if (date < ajouterJours(lundi2, 7)) return 2;
  if (date < ajouterJours(lundi2, 14)) return 3;
  return 4;
}

function blocAgilite(ctx: Ctx): Item[] {
  const { type } = ctx.seance;
  if (ctx.jourDeMatch || type === 'D' || ctx.seance.test || ctx.phase === 'affutage') return [];
  const etape = etapeChangementsDeDirection(ctx);
  const a = (id: string, o: Options) => (dispo(id, ctx) ? [{ bloc: 'agilite' as const, p: px(id, 'agilite', o) }] : []);
  const essaiOu = (id: string, o: Options): Item[] => {
    if (peutEssayerBloc(id, ctx)) return [{ bloc: 'agilite', p: enEssai(px(id, 'agilite', o)) }];
    return a(id, o);
  };
  switch (etape) {
    case 0:
      return [];
    case 1: // latéral contrôlé
      return [
        ...a('A12', { series: 3, reps: f(8), parCote: true, minutes: 4 }),
        ...a('A4', { series: 4, secondes: f(10, 15), note: 'Lentement', minutes: 3 }),
        ...a('P14', { series: 3, reps: f(5), parCote: true, note: 'Sauts courts, réception tenue', minutes: 3 }),
      ];
    case 2: {
      if (type !== 'B') return [];
      const items = [
        ...a('A4', { series: 4, secondes: f(10, 15), note: 'Rapides', minutes: 2.5 }),
        ...essaiOu('A9', { series: 4, secondes: f(10, 15), minutes: 2.5 }),
        ...a('P15', { series: 3, secondes: f(10, 15), minutes: 2.5 }),
        ...essaiOu('A8', { reps: f(6, 8), note: 'À 70 %, des deux côtés', intensite: 70, minutes: 2.5 }),
      ];
      return dedoublonner(items);
    }
    case 3:
      if (type !== 'B') return [];
      return dispo('A8', ctx)
        ? a('A8', { reps: f(4, 6), note: 'À 85-90 %, peu de répétitions, des deux côtés', intensite: 90, minutes: 5 })
        : a('A4', { series: 4, secondes: f(10, 15), note: 'Rapides', minutes: 3 });
    case 4:
      // Appoint, seulement les semaines sans match (section 4 : retirés dès 1 match à partir de février).
      if (type !== 'B' || ctx.nbMatchs > 0) return [];
      return [
        ...a('A4', { series: 4, secondes: f(10, 15), minutes: 3 }),
        ...a('A12', { series: 3, reps: f(8), parCote: true, minutes: 4 }),
        ...a('A8', { reps: f(6, 8), note: 'Des deux côtés', minutes: 3 }),
      ];
  }
}

function dedoublonner(items: Item[]): Item[] {
  const vus = new Set<string>();
  return items.filter((it) => (vus.has(it.p.id) ? false : (vus.add(it.p.id), true)));
}

/** A8 et A9 sont à essayer dans le bloc de S8 (section 6 et tableau de la section 3). Refusés : A4. */
function peutEssayerBloc(id: string, ctx: Ctx): boolean {
  if (statutDe(id, ctx.etat) !== 'a-essayer' || ctx.legere) return false;
  const faits = ctx.essaisFaits.get(id) ?? 0;
  return faits < ((ctx.etat.reessais ?? []).includes(id) ? 2 : 1);
}

// ---------- Ajustements ----------

function uneSerieDeMoins(p: Prescription): Prescription {
  if (p.series && p.series > 1 && !['prevention', 'echauffement', 'agilite', 'test', 'mobilite'].includes(p.role)) {
    return { ...p, series: p.series - 1 };
  }
  return p;
}

const fois = (r: Fourchette, k: number): Fourchette => ({ min: Math.max(1, Math.round(r.min * k)), max: Math.max(1, Math.round(r.max * k)) });
const moitie = (r: Fourchette): Fourchette => ({ min: Math.max(1, Math.ceil(r.min / 2)), max: Math.max(1, Math.ceil(r.max / 2)) });

/** Semaine légère (section 6) : 1 série de moins par exercice, moins de sprints et de sauts, mêmes charges. */
function alleger(p: Prescription): Prescription {
  if ((p.role === 'acceleration' || p.role === 'vitesse-max') && p.reps) return { ...p, reps: fois(p.reps, 0.65) };
  if (p.id === 'A1' && p.reps) return { ...p, reps: fois(p.reps, 0.65) };
  if (p.id === 'E7') return { ...p, format: 'Pyramide de 15, 30, 45, 30 et 15 s (jusqu’à 45 s seulement)', minutes: 4.5 };
  if (p.role === 'intermittent' && (p.series ?? 1) === 1 && p.reps) return { ...p, reps: fois(p.reps, 0.65) };
  return uneSerieDeMoins(p);
}

/** Coupes selon le nombre de matchs de la semaine (section 4). */
function couperPourLesMatchs(items: Item[], ctx: Ctx, messages: string[]): Item[] {
  if (ctx.nbMatchs === 0 || ctx.phase === 'affutage') return items;
  let resultat = items;
  if (ctx.nbMatchs === 1) {
    // Intermittents de course : moitié (sur vélo le lendemain du match, déjà traité par la variante sans course).
    resultat = resultat.map((it) => {
      const p = it.p;
      if (p.role !== 'intermittent' || p.id === 'E10' || it.bloc === 'echauffement') return it;
      if (p.id === 'E7') return { ...it, p: { ...p, format: 'Pyramide de 15, 30, 45, 30 et 15 s (jusqu’à 45 s seulement)', minutes: 4.5 } };
      if ((p.series ?? 1) > 1) return { ...it, p: { ...p, series: Math.ceil((p.series ?? 1) / 2) } };
      return p.reps ? { ...it, p: { ...p, reps: moitie(p.reps) } } : it;
    });
    if (resultat.some((it) => it.p.role === 'intermittent' && it.p.id !== 'E10')) messages.push('1 match cette semaine : intermittents réduits de moitié.');
    return resultat;
  }
  const avant = resultat;
  // 2 matchs ou plus (une semaine de tournoi compte ici) : coupes de la colonne « 2 matchs ».
  resultat = resultat
    .filter((it) => it.p.role !== 'vitesse-max') // accélérations seulement
    .filter((it) => !(it.bloc === 'pliometrie' && (it.p.id === 'P14' || it.p.id === 'P15'))) // rien de côté
    .map((it) => {
      const p = it.p;
      if (p.role === 'acceleration' && p.reps) return { ...it, p: { ...p, reps: fois(p.reps, 2 / 3) } }; // un tiers en moins
      if (it.bloc === 'pliometrie' && p.role === 'plio') {
        return { ...it, p: p.reps ? { ...p, reps: moitie(p.reps) } : p.secondes ? { ...p, secondes: moitie(p.secondes) } : p }; // moitié des sauts
      }
      if (BAS_DU_CORPS.has(p.id) && it.bloc === 'force') return { ...it, p: uneSerieDeMoins(p) }; // charges gardées, 1 série de moins
      return it;
    });
  const coupes = [
    avant.some((it) => it.p.role === 'acceleration' || it.p.role === 'vitesse-max') && 'vitesse en accélérations seulement, un tiers de répétitions en moins',
    avant.some((it) => it.bloc === 'pliometrie') && 'moitié des sauts, rien de côté',
    avant.some((it) => it.bloc === 'force' && BAS_DU_CORPS.has(it.p.id)) && '1 série de moins en force du bas du corps (mêmes charges)',
    ctx.seance.type === 'C' && 'pas d’intermittents ni de course',
  ].filter((c): c is string => !!c);
  if (coupes.length) messages.push(`2 matchs ou plus cette semaine : ${coupes.join(' ; ')}.`);
  return resultat;
}

/** Séance le jour d'un match : haut du corps et tronc seulement, sans course ni sauts (section 3, règle 2). */
function jourDeMatch(items: Item[]): Item[] {
  return items.filter((it) => ['force', 'prevention', 'echauffement'].includes(it.bloc) && !BAS_DU_CORPS.has(it.p.id));
}

/** Progression et douleurs (section 5) : volume de sprints, tension, pauses. */
function ajusterProgression(items: Item[], ctx: Ctx): Item[] {
  const { etat } = ctx;
  let resultat = items;
  const sprint = (it: Item) => it.p.role === 'acceleration' || it.p.role === 'vitesse-max';
  // On progresse en volume, jamais en intensité : +1 sprint par semaine réussie, jusqu'au haut de la fourchette.
  const plus = etat.sprintsEnPlus ?? 0;
  if (plus > 0 && ctx.phase !== 'affutage') {
    resultat = resultat.map((it) =>
      sprint(it) && it.p.reps ? { ...it, p: { ...it.p, reps: { min: Math.min(it.p.reps.max, it.p.reps.min + plus), max: it.p.reps.max } } } : it,
    );
  }
  // Intermittents : 1 répétition de plus par série chaque fois que le format revient, jusqu'au haut de la fourchette.
  const inter = etat.intermittentsEnPlus ?? {};
  if (ctx.phase !== 'affutage') {
    resultat = resultat.map((it) => {
      const max = INTERMITTENTS_MAX[it.p.id];
      const enPlus = inter[it.p.id] ?? 0;
      if (it.p.role !== 'intermittent' || !max || !enPlus || !it.p.reps) return it;
      const min = Math.min(max, it.p.reps.min + enPlus);
      return { ...it, p: { ...it.p, reps: { min, max: Math.max(min, it.p.reps.max) } } };
    });
  }
  if (etat.vitesseMaxEnPauseJusquau && ctx.seance.date <= etat.vitesseMaxEnPauseJusquau) {
    const avant = resultat.length;
    resultat = resultat.filter((it) => it.p.role !== 'vitesse-max' && it.p.id !== 'V3');
    if (resultat.length < avant || ctx.seance.type === 'A' || ctx.seance.type === 'U') {
      ctx.messages.push(`Tension récente derrière la cuisse ou le genou : pas de V3 ni de vitesse maximale jusqu'au ${dateCourte(etat.vitesseMaxEnPauseJusquau)}. F10 et M10 restent.`);
    }
  }
  if (etat.pauseCourse) {
    resultat = resultat
      .filter((it) => !sprint(it) && it.p.id !== 'A1')
      .map((it) => (it.p.role === 'intermittent' && it.p.id !== 'E10' ? { ...it, p: intermittent('E10', { remplaceCourse: true }) } : it));
    ctx.messages.push('Course en pause (douleur depuis plus d’une semaine) : sprints retirés, cardio sur vélo ou rameur.');
  }
  if (etat.pausePlio && resultat.some((it) => it.bloc === 'pliometrie' && it.p.role === 'plio')) {
    resultat = resultat.filter((it) => !(it.bloc === 'pliometrie' && it.p.role === 'plio'));
    ctx.messages.push('Pliométrie en pause (douleur aux chevilles depuis plus d’une semaine).');
  }
  return resultat;
}

// ---------- Séance ----------

function composerSeance(ctx: Ctx): ContenuSeance {
  const messages = ctx.messages;
  const { seance } = ctx;
  let corps: Item[];
  let avecEchauffement = true;

  if (seance.test === 'journee1') {
    corps = seanceJournee1(ctx);
    avecEchauffement = false;
  } else if (seance.test === 'cooper') {
    corps = seanceCooper(ctx);
  } else if (ctx.phase === 'affutage') {
    corps = affutage(ctx);
  } else if (seance.type === 'U') {
    corps = seanceUnique(ctx);
  } else if (ctx.phase === 'fondation') {
    corps = fondation(ctx);
  } else if (ctx.phase === 'puissance-repetition') {
    corps = puissanceRepetition(ctx);
  } else {
    corps = forceVitesse(ctx); // force et vitesse, développement, maintien
  }

  if (ctx.miniRetest) {
    // Mini-retest (S5, 20 min) : il remplace les sauts et M1 (le test du mollet est le même mouvement, poussé au maximum).
    corps = [
      ...['T-cheville', 'T-saut', 'T-mollet'].map((id) => ({ bloc: 'tests' as const, p: test(id) })),
      ...corps.filter((it) => !(it.bloc === 'pliometrie' && it.p.role === 'plio') && !(it.bloc === 'prevention' && it.p.id === 'M1')),
    ];
    messages.push('Mini-retest : flexion de cheville, saut en longueur et mollet sur une jambe, à la place des sauts et de M1.');
  }
  corps = ajusterProgression(corps, ctx);

  if (ctx.legere && ctx.phase !== 'affutage' && !seance.test) {
    corps = corps.map((it) => ({ ...it, p: alleger(it.p) }));
    messages.push('Semaine légère : 1 série de moins, moins de sprints et de sauts, mêmes charges.');
  }
  if (!seance.test) corps = couperPourLesMatchs(corps, ctx, messages);
  if (ctx.jourDeMatch) {
    corps = jourDeMatch(corps);
    // Décision de Lily (18 novembre 2026) : du cardio très facile est permis le jour d'un match, s'il y a une séance.
    corps.push({
      bloc: 'cardio',
      p: px('E10', 'cardio', { nom: 'Vélo ou rameur, très facile', format: '10 à 15 min, facultatif', minutes: 12, note: 'Sans forcer : le match passe avant.' }),
    });
  }

  const course = corps.some((it) => ['acceleration', 'vitesse-max', 'course', 'intermittent'].includes(it.p.role) && it.p.id !== 'E10') || corps.some((it) => it.p.id.startsWith('T-sprint') || it.p.id === 'T-cooper');
  let items: Item[] = [
    ...(avecEchauffement ? echauffement(ctx, course, !ctx.jourDeMatch) : []),
    ...(seance.test === 'journee1' || ctx.etat.pausePlio ? [] : blocAgilite(ctx)),
    ...corps,
  ];

  // Sprint limité : chaque exercice de vitesse affiche l'intensité permise (section 3).
  const intensite = restrictionsAu(ctx.cal.config, seance.date).intensiteSprint;
  if (intensite < 100) {
    items = items.map((it) => {
      const e = it.p.id.startsWith('T-') ? null : exercice(it.p.id);
      return e && (e.type === 'vitesse' || it.p.id === 'A1') ? { ...it, p: { ...it.p, intensite } } : it;
    });
  }

  // Allures tirées de la VMA, et série en plus du côté le plus faible.
  const { vma, seriesEnPlus } = ctx.etat;
  items = items.map((it) => {
    let p = it.p;
    if (vma && p.pctVMA && it.bloc !== 'echauffement') {
      p = { ...p, vitesseKmh: { min: (vma * p.pctVMA.min) / 100, max: (vma * p.pctVMA.max) / 100 } };
      if (p.id === 'E5' || p.id === 'E6') p.recuperationKmh = { min: vma * 0.4, max: vma * 0.5 };
    }
    const cote = seriesEnPlus?.[p.id];
    if (cote && it.bloc !== 'echauffement' && it.bloc !== 'agilite') p = { ...p, serieEnPlus: cote };
    return p === it.p ? it : { ...it, p };
  });

  // Durée estimée et respect de la durée maximale (1 h 30, ou environ 1 h en période allégée).
  items = items.map((it) => ({ ...it, p: { ...it.p, minutesEstimees: Math.round(estimer(it.p) * 10) / 10, sauts: sauts(it.p) || undefined } }));
  const limite = seance.dureeMax < 90 ? seance.dureeMax + 5 : seance.dureeMax;
  const total = () => items.reduce((t, it) => t + it.p.minutesEstimees, 0);
  const retires: string[] = [];
  while (total() > limite) {
    const candidats = items.filter((it) => it.p.retrait > 0);
    if (candidats.length === 0) break;
    const pire = candidats.reduce((a, b) => (b.p.retrait > a.p.retrait ? b : a));
    items = items.filter((it) => it !== pire);
    retires.push(pire.p.nom.toLowerCase());
  }
  if (retires.length) {
    messages.push(`Séance raccourcie pour tenir en ${texteDuree(seance.dureeMax)} : ${retires.join(', ')} retiré${retires.length > 1 ? 's' : ''}.`);
  }

  const essais = items.filter((it) => it.p.essai).map((it) => it.p.id);
  for (const id of essais) {
    messages.push(`À essayer : ${exercice(id).nom} (${id}). Sinon : ${remplacementDe(id) ?? '—'}.`);
  }

  const blocs: Bloc[] = [];
  for (const type of ORDRE_BLOCS) {
    const exercices = items.filter((it) => it.bloc === type).map((it) => it.p);
    if (exercices.length === 0) continue;
    blocs.push({ type, titre: TITRES[type], exercices, minutes: Math.round(exercices.reduce((t, p) => t + p.minutesEstimees, 0)) });
  }
  return {
    blocs,
    minutes: Math.round(total()),
    sauts: items.reduce((t, it) => t + (it.bloc === 'echauffement' ? 0 : (it.p.sauts ?? 0)), 0),
    course,
    essais,
    messages,
  };
}

// ---------- Semaine ----------

/** Rang de la semaine dans sa phase, sans compter les semaines légères (pas de rotation en semaine légère). */
function compteurRotation(cal: Calendrier, semaine: Semaine): number {
  const normalesAvant = cal.semaines.filter((s) => s.phase === semaine.phase && s.numero < semaine.numero && s.legere?.etendue !== 'complete').length;
  return semaine.legere?.etendue === 'complete' ? Math.max(0, normalesAvant - 1) : normalesAvant;
}

/**
 * Détaille chaque séance d'une semaine planifiée.
 * Les séances sont traitées dans l'ordre des jours : un essai prévu un jour compte pour les suivants.
 */
export function detaillerSemaine(cal: Calendrier, plan: PlanSemaine, etat: EtatContenu = {}): ContenuSemaine {
  const semaine = cal.semaines[plan.numero - 1];
  if (!semaine) throw new Error(`Semaine ${plan.numero} absente du programme.`);
  const essaisFaits = new Map(Object.entries(etat.essais ?? {}));
  const joursMatch = new Set(plan.matchs.map((m) => m.date));
  const nbMatchs = plan.matchs.length;
  const legere = semaine.legere?.etendue === 'complete';
  const premieres = new Set<string>(); // mouvements déjà vus cette semaine (−5 % à la première séance de la phase)
  const essaisPrevus: string[] = [];
  const messages: string[] = [];
  const reste = { cardio: !!etat.courseEnCardioApres };
  // Mini-retest : dans la séance B (ou la première séance qui n'est pas D).
  const triees = [...plan.seances].sort((a, b) => (a.date < b.date ? -1 : 1));
  const cibleMini = semaine.retests.some((r) => r.type === 'mini')
    ? (triees.find((s) => s.type === 'B' && !s.test) ?? triees.find((s) => s.type !== 'D' && !s.test) ?? triees[0])?.date
    : undefined;

  const seances = [...plan.seances]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((seance): SeanceDetaillee => {
      const ctx: Ctx = {
        cal,
        semaine,
        seance,
        etat,
        phase: semaine.phase,
        rot: compteurRotation(cal, semaine),
        legere,
        nbMatchs,
        jourDeMatch: joursMatch.has(seance.date),
        sansCourse: seance.variante === 'sans-course',
        essaisFaits,
        reste,
        messages: [],
        miniRetest: seance.date === cibleMini,
      };
      ctx.essai = candidatsEssai(ctx).find((id) => peutEssayer(id, ctx));
      const contenu = composerSeance(ctx);

      // Première séance de la phase : −5 % sur les mouvements testés.
      for (const bloc of contenu.blocs) {
        for (const p of bloc.exercices) {
          if (p.pourcentage1RM === undefined) continue;
          if (semaine.rangDansPhase === 1 && !premieres.has(p.id)) p.moinsCinqPourcent = true;
          premieres.add(p.id);
        }
      }
      for (const id of contenu.essais) {
        essaisFaits.set(id, (essaisFaits.get(id) ?? 0) + 1);
        essaisPrevus.push(id);
      }
      // 2 matchs ou plus : C devient force du haut du corps + tronc, sans course (section 4).
      const sansIntermittents = seance.type === 'C' && !seance.test && nbMatchs >= 2 && semaine.phase !== 'fondation' && semaine.phase !== 'affutage';
      const libelle = sansIntermittents ? 'Force du haut du corps et tronc (sans course : 2 matchs cette semaine)' : seance.libelle;
      return { ...seance, libelle, contenu };
    });

  if (nbMatchs >= 2 && semaine.phase !== 'affutage') {
    messages.push('2 matchs ou plus cette semaine : ajoute 1 routine de prévention de 10 min à la maison (M1, M7, M3).');
  }
  return { seances, messages, essaisPrevus, courseEnCardioUtilisee: !!etat.courseEnCardioApres && !reste.cardio };
}

// ---------- Affichage du dosage ----------

/** « 1 h 30 », « environ 1 h », « 75 min ». */
export const texteDuree = (minutes: number) => (minutes === 60 ? 'environ 1 h' : minutes % 60 === 0 ? `${minutes / 60} h` : minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60}` : `${minutes} min`);

const fourchette = (r: Fourchette) => (r.min === r.max ? `${r.min}` : `${r.min} à ${r.max}`);

/** Le dosage en toutes lettres : « 3 × 8 à 10 par côté », « 4 à 8 × 10 m », « 20 min »… */
export function texteDosage(p: Prescription): string {
  if (p.role === 'intermittent' && p.reps && p.format && p.id !== 'E7') {
    return (p.series ?? 1) > 1 ? `${p.series} séries de ${fourchette(p.reps)} : ${p.format}, 3 min entre les séries` : `${fourchette(p.reps)} × (${p.format})`;
  }
  if (p.format && !(p.series && (p.reps || p.secondes))) return p.format;
  const cote = p.parCote ? ' par côté' : '';
  if (p.series && p.reps) return p.format ?? `${p.series} × ${fourchette(p.reps)}${p.unite ? ` ${p.unite}` : ''}${cote}`;
  if (p.series && p.secondes) return `${p.series} × ${fourchette(p.secondes)} s${cote}`;
  if (p.series && p.metres) return `${p.series} × ${fourchette(p.metres)} m`;
  if (p.reps && p.metres) return `${fourchette(p.reps)} × ${fourchette(p.metres)} m`;
  if (p.reps) return `${fourchette(p.reps)} répétitions${cote}`;
  if (p.minutes) return `${p.minutes} min`;
  return '';
}
