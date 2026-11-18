// Ce que Lily entre dans l'app. Rien d'autre n'est enregistré : le plan est recalculé à partir de ces entrées.

import type { SeanceDetaillee } from '../moteur/contenu';
import type { DateISO } from '../moteur/dates';
import type { ChoixSemaine } from '../moteur/semaine';
import type { Statut } from '../donnees/types';
import type { MatchRegulier, Periode, ProgrammeConfig } from '../moteur/types';

export type Unite = 'kg' | 'lb';
export type UniteAllure = 'min/km' | 'km/h' | 'mi/h';
export type RaisonPasFait = 'temps' | 'materiel' | 'douleur' | 'autre';
/** Réponse après l'essai d'un exercice « à essayer » (section 6). */
export type Decision = 'garde' | 'refuse' | 'reessai';

export interface Serie {
  reps?: number;
  secondes?: number;
  charge?: number;
}

export interface ResultatExercice {
  pasFait?: { raison: RaisonPasFait; versionPlusFacile?: boolean };
  /** Force et tronc : une ligne par série. */
  series?: Serie[];
  unite?: Unite;
  /** Sprints, sauts ou efforts faits. */
  nombre?: number;
  /** En mètres : sprints, distance totale de E8, saut en longueur. */
  distance?: number;
  /** En cm : hauteur de boîte (P4). */
  hauteur?: number;
  /** En secondes : sprint filmé. */
  temps?: number;
  /** Course ou cardio. */
  minutes?: number;
  /** Course : distance en km. */
  km?: number;
  /** Tests : une valeur, ou une par côté. */
  mesure?: { valeur?: number; gauche?: number; droite?: number };
  /** Test demi-Cooper : tours de piste et mètres du dernier tour partiel. */
  cooper?: { tours?: number; reste?: number };
  decision?: Decision;
  /** Ce qui était prévu (répétitions visées, charge), pour la progression. */
  prevu?: { reps?: number; charge?: number };
  /** Sprints : tension derrière la cuisse ou le genou (section 5). */
  tension?: boolean;
  /** Ressenti et commentaire de Lily sur l'exercice (pour adapter le programme plus tard). */
  avis?: { ressenti?: 'trop-dur' | 'trop-facile' | 'aime' | 'aime-pas'; commentaire?: string };
  /** Intermittents : allure sur au moins la moitié des efforts (section 5). */
  rythme?: 'plus-vite' | 'prevu' | 'plus-lent';
}

/** Notes de douleur de 0 à 10 (section 5). */
export interface Douleurs {
  tibias?: number;
  genou?: number;
  chevilles?: number;
}

export interface ResultatSeance {
  date: DateISO;
  semaine: number;
  /** Ce qui était prévu, figé dès la première saisie. */
  seance: SeanceDetaillee;
  /** Par clé « bloc:numéro » (un même exercice peut être dans l'échauffement et dans la séance). */
  exercices: Record<string, ResultatExercice>;
  effort?: number;
  douleurs?: Douleurs;
  /** Notes du lendemain matin, après une course ou des sauts. */
  douleursLendemain?: Douleurs;
  terminee: boolean;
  modifieLe: string;
}

export interface Preferences {
  /** Unité de charge choisie pour chaque exercice. */
  unites: Record<string, Unite>;
  allure: UniteAllure;
  /** Écart entre deux poids disponibles au gym, par matériel (sinon : valeurs par défaut). */
  crans?: Partial<Record<'barre' | 'halteres' | 'kettlebell' | 'machine', Partial<Record<Unite, number>>>>;
  /** Badges déjà vus sur l'écran Progrès (les autres sont annoncés comme nouveaux). */
  badgesVus?: string[];
  /** Date de la dernière sauvegarde exportée (AAAA-MM-JJ). */
  derniereSauvegarde?: DateISO;
}

/** Un programme enregistré (Lily peut en garder plusieurs, un seul est suivi). */
export interface MetaProgramme {
  id: string;
  nom: string;
  creeLe: string;
}

export interface Donnees {
  /** Programme créé avec le questionnaire. Absent : la saison 2026-2027. */
  programme?: ProgrammeConfig;
  /** Statuts des exercices changés par Lily dans l'écran Exercices (section 6). */
  statuts: Record<string, Statut>;
  choix: Record<number, ChoixSemaine>;
  /** Semaines que Lily a demandées légères (« J'ai besoin d'une semaine légère »). */
  legeresDemandees: number[];
  /** Matchs réguliers et tournois ajoutés par Lily (ligue du jeudi…), en plus de ceux de la saison. */
  saison: { matchsReguliers: MatchRegulier[]; tournois: Periode[] };
  /** Note d'effort de 0 à 10 après un match ou un jour de tournoi (section 5). */
  notesMatchs: Record<DateISO, number>;
  /** Jours où Lily a fait sa routine de 10 min à la maison (M1, M7, M3). */
  routinesMaison: DateISO[];
  resultats: Record<DateISO, ResultatSeance>;
  preferences: Preferences;
}

export const DONNEES_VIDES: Donnees = {
  statuts: {},
  choix: {},
  legeresDemandees: [],
  saison: { matchsReguliers: [], tournois: [] },
  notesMatchs: {},
  routinesMaison: [],
  resultats: {},
  preferences: { unites: {}, allure: 'min/km' },
};
