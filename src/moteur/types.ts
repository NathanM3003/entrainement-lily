import type { DateISO, JourSemaine } from './dates';

// ---------- Paramètres d'un programme (Règles, section 0 « Création d'un programme ») ----------

export interface Periode {
  debut: DateISO;
  fin: DateISO;
  nom: string;
  note?: string;
}

export interface MatchRegulier {
  nom: string;
  jour: JourSemaine;
  debut: DateISO;
  fin?: DateISO;
}

/** Restrictions datées (Règles, section 3). Les dates « jusqu'au » sont incluses. */
export interface Restrictions {
  sprint?: { intensiteMax: number; jusquau: DateISO };
  changementsDeDirection?: { jusquau: DateISO };
}

export type TypeRetest = 'journee1' | 'sprint' | 'mini' | 'cooper';

export type MomentRetest =
  | 'semaine' // pendant la semaine (S1)
  | 'debut' // en début de semaine
  | 'fin' // en fin de semaine
  | 'premiere-seance-a' // à la première séance A de la semaine
  | 'condition'; // dès qu'une condition est remplie (Cooper en Fondation)

export interface RetestPrevu {
  type: TypeRetest;
  moment: MomentRetest;
  /** Semaine prévue. Pour « condition », première semaine où il est probable. */
  semaine: number;
  /** Pour « condition » : dernière semaine probable. */
  jusquaSemaine?: number;
  sansSprint?: boolean;
  avecSautUneJambe?: boolean;
  /** Retest final, suivi de la page « bilan de préparation ». */
  final?: boolean;
}

export interface SemaineLegerePrevue {
  semaine: number;
  raison: string;
}

export interface ProgrammeConfig {
  nom: string;
  /** Début du programme. */
  debut: DateISO;
  /** Échéance : début de saison ou tournoi visé. Le programme s'arrête la veille. */
  echeance: DateISO;
  echeanceNom: string;
  restrictions: Restrictions;
  periodesAllegees: Periode[];
  tournois: Periode[];
  matchsReguliers: MatchRegulier[];
  /** Calendrier des retests validé pour ce programme (Règles, section 6). */
  retests: RetestPrevu[];
  /** Semaines légères fixées en plus de celles que le moteur déduit (Règles, section 6). */
  semainesLegeres: SemaineLegerePrevue[];
}

// ---------- Résultat du moteur ----------

export type Phase = 'fondation' | 'force-vitesse' | 'puissance-repetition' | 'developpement' | 'maintien' | 'affutage';

export const LIBELLES_PHASES: Record<Phase, string> = {
  fondation: 'Fondation',
  'force-vitesse': 'Force et vitesse',
  'puissance-repetition': 'Puissance et répétition',
  developpement: 'Développement',
  maintien: 'Maintien',
  affutage: 'Affûtage',
};

export type TypeEvenement = 'match' | 'tournoi' | 'sprint-100' | 'changements-de-direction';

export interface Evenement {
  date: DateISO;
  type: TypeEvenement;
  nom: string;
}

export interface Legerete {
  /** « complete » : toute la semaine est légère. « debut » : lundi et mardi seulement (après un tournoi). */
  etendue: 'complete' | 'debut';
  raisons: string[];
}

export interface Semaine {
  numero: number;
  debut: DateISO;
  /** Dimanche, ou veille de l'échéance pour la dernière semaine. */
  fin: DateISO;
  phase: Phase;
  /** Rang de la semaine dans sa phase (1, 2, …). */
  rangDansPhase: number;
  /** Bloc de la phase quand une phase de plus de 6 semaines est coupée en deux. */
  bloc?: 1 | 2;
  legere: Legerete | null;
  /** Semaine qui contient un tournoi : au plus 2 séances courtes. */
  tournoi: boolean;
  /** Jours de période allégée (séances d'environ 1 h). */
  joursAlleges: DateISO[];
  /** Jours de récupération après un tournoi (charge faible ou repos). */
  joursRecuperation: DateISO[];
  evenements: Evenement[];
  retests: RetestPrevu[];
}

export interface Calendrier {
  config: ProgrammeConfig;
  /** Jours avant le premier lundi, réservés aux tests de la journée 1. */
  prelude: DateISO[];
  semaines: Semaine[];
  avertissements: string[];
}
