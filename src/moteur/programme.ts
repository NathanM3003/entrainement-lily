// Création d'un programme (Règles du programme, section 0 « Création d'un programme » et section 6 « Retests »).
// Les réponses au questionnaire deviennent un ProgrammeConfig ; le reste (phases, semaines légères,
// placement, contenu) est déduit par le moteur, comme pour la saison 2026-2027.

import { ajouterJours, ecartJours, jourSemaine, lundiDe, type DateISO } from './dates';
import { decouperPhases } from './phases';
import type { EtatSante, Lieu, MatchRegulier, Periode, ProgrammeConfig, RetestPrevu, ZoneSante } from './types';

export const LIBELLES_ZONES: Record<ZoneSante, string> = {
  chevilles: 'Chevilles',
  genoux: 'Genoux',
  ischios: 'Ischios',
  tibias: 'Tibias',
  autre: 'Autre',
};
export const LIBELLES_ETATS: Record<EtatSante, string> = { ok: 'Ça va', sensible: 'Sensible', reeducation: 'En rééducation' };
export const LIBELLES_LIEUX: Record<Lieu, string> = { gym: 'Gym', piste: 'Piste', tapis: 'Tapis roulant' };

/** Réponses au questionnaire de création. */
export interface ReponsesProgramme {
  nom: string;
  debut: DateISO;
  echeance: DateISO;
  echeanceNom: string;
  tournois: Periode[];
  periodesAllegees: Periode[];
  matchsReguliers: MatchRegulier[];
  sante: Partial<Record<ZoneSante, { etat: EtatSante; note?: string }>>;
  /** Sprint limité : intensité maximale et date de fin (incluse). */
  sprint?: { intensiteMax: number; jusquau: DateISO };
  /** Pas de changement de direction jusqu'à cette date (incluse). */
  changementsDeDirectionJusquau?: DateISO;
  seancesParSemaine: number;
  dureeMax: number;
  lieux: Lieu[];
  /** Étape de course facile de départ (1 à 7), d'après la dernière course faite sans douleur. */
  etapeCourse: number;
  derniereCourse?: string;
  allures?: string;
  charges?: string;
}

/** Les réponses tirées d'un programme existant (le questionnaire est prérempli avec lui). */
export function reponsesDe(config: ProgrammeConfig): ReponsesProgramme {
  return {
    nom: config.nom,
    debut: config.debut,
    echeance: config.echeance,
    echeanceNom: config.echeanceNom,
    tournois: config.tournois.map((t) => ({ ...t })),
    periodesAllegees: config.periodesAllegees.map((p) => ({ ...p })),
    matchsReguliers: config.matchsReguliers.map((m) => ({ ...m })),
    sante: { ...config.sante },
    sprint: config.restrictions.sprint ? { ...config.restrictions.sprint } : undefined,
    changementsDeDirectionJusquau: config.restrictions.changementsDeDirection?.jusquau,
    seancesParSemaine: config.disponibilites?.seancesParSemaine ?? 3,
    dureeMax: config.disponibilites?.dureeMax ?? 90,
    lieux: config.disponibilites?.lieux ?? ['gym', 'piste', 'tapis'],
    etapeCourse: config.niveau?.etapeCourse ?? 1,
    derniereCourse: config.niveau?.derniereCourse,
    allures: config.niveau?.allures,
    charges: config.niveau?.charges,
  };
}

/** Problèmes qui empêchent de créer le programme, en phrases claires. Vide si tout va bien. */
export function verifierReponses(r: ReponsesProgramme): string[] {
  const erreurs: string[] = [];
  if (!r.debut || !r.echeance) return ['Il faut une date de début et une échéance.'];
  if (r.echeance <= r.debut) erreurs.push("L'échéance doit être après le début du programme.");
  const premierLundi = jourSemaine(r.debut) === 1 ? r.debut : ajouterJours(lundiDe(r.debut), 7);
  if (r.echeance > r.debut && ajouterJours(r.echeance, -1) < premierLundi) erreurs.push("Il faut au moins une semaine complète avant l'échéance.");
  for (const t of r.tournois) {
    if (!t.nom.trim() || !t.debut || !t.fin || t.fin < t.debut) erreurs.push(`Tournoi « ${t.nom || 'sans nom'} » : vérifie le nom et les dates.`);
  }
  for (const p of r.periodesAllegees) {
    if (!p.nom.trim() || !p.debut || !p.fin || p.fin < p.debut) erreurs.push(`Période allégée « ${p.nom || 'sans nom'} » : vérifie le nom et les dates.`);
  }
  for (const m of r.matchsReguliers) if (!m.nom.trim() || !m.debut) erreurs.push(`Match régulier « ${m.nom || 'sans nom'} » : vérifie le nom et la date de début.`);
  if (r.sprint && (r.sprint.intensiteMax < 50 || r.sprint.intensiteMax > 100 || !r.sprint.jusquau)) erreurs.push('Sprint limité : une intensité entre 50 et 100 %, et une date de fin.');
  return erreurs;
}

/** Nombre de semaines du programme (Règles, section 1, « Calcul des durées »). */
export function nombreSemaines(debut: DateISO, echeance: DateISO): number {
  const premierLundi = jourSemaine(debut) === 1 ? debut : ajouterJours(lundiDe(debut), 7);
  return ecartJours(premierLundi, lundiDe(ajouterJours(echeance, -1))) / 7 + 1;
}

/**
 * Retests d'un autre programme (Règles, section 6) :
 * - tests de la journée 1 au début (sans le sprint s'il est limité) ;
 * - test de sprint à la première séance A où le sprint à 100 % est permis ;
 * - test de Cooper dès que la condition est remplie, de la fin de la Fondation au début de la phase suivante,
 *   puis au début de la phase 3 pour ses allures ;
 * - un retest à la fin de chaque phase, sauf pendant l'affûtage ; le dernier, à la fin de la phase 3, est le retest final.
 */
export function retestsParDefaut(r: Pick<ReponsesProgramme, 'debut' | 'echeance' | 'sprint' | 'changementsDeDirectionJusquau'>): RetestPrevu[] {
  const n = nombreSemaines(r.debut, r.echeance);
  const { segments } = decouperPhases(n);
  const premierLundi = jourSemaine(r.debut) === 1 ? r.debut : ajouterJours(lundiDe(r.debut), 7);
  const semaineDe = (date: DateISO) => Math.floor(ecartJours(premierLundi, date) / 7) + 1;
  const retests: RetestPrevu[] = [];

  const sprintLimite = !!r.sprint && r.sprint.jusquau >= r.debut;
  retests.push({ type: 'journee1', moment: 'semaine', semaine: 1, ...(sprintLimite ? { sansSprint: true } : {}) });

  // Fin de chaque phase (hors affûtage) ; dernière fin de phase avant l'affûtage = retest final.
  let fin = 0;
  const fins: { semaine: number; phase: string }[] = [];
  for (const s of segments) {
    fin += s.semaines;
    if (s.phase !== 'affutage') fins.push({ semaine: fin, phase: s.phase });
  }
  if (sprintLimite) {
    const semaineSprint = semaineDe(ajouterJours(r.sprint!.jusquau, 1));
    const avantAffutage = fins.at(-1)?.semaine ?? 0;
    if (semaineSprint >= 1 && semaineSprint <= avantAffutage) retests.push({ type: 'sprint', moment: 'premiere-seance-a', semaine: Math.max(2, semaineSprint) });
  }
  const fondation = segments.find((s) => s.phase === 'fondation')?.semaines ?? 0;
  if (fondation >= 2 && segments.length > 2) retests.push({ type: 'cooper', moment: 'condition', semaine: Math.max(2, fondation - 1), jusquaSemaine: fondation + 1 });
  const phase3 = segments.findIndex((s) => s.phase === 'puissance-repetition');
  if (phase3 >= 0) {
    const debutPhase3 = segments.slice(0, phase3).reduce((t, s) => t + s.semaines, 0) + 1;
    retests.push({ type: 'cooper', moment: 'debut', semaine: debutPhase3 });
  }
  fins.forEach((f, i) => {
    if (f.semaine === 1) return; // la journée 1 vient d'avoir lieu
    const finDeSemaine = ajouterJours(premierLundi, 7 * f.semaine - 1);
    const sautUneJambe = !r.changementsDeDirectionJusquau || r.changementsDeDirectionJusquau < finDeSemaine;
    retests.push({
      type: 'journee1',
      moment: 'fin',
      semaine: f.semaine,
      ...(sautUneJambe ? { avecSautUneJambe: true } : {}),
      ...(i === fins.length - 1 ? { final: true } : {}),
    });
  });
  return retests.sort((a, b) => a.semaine - b.semaine);
}

/**
 * Programme tiré des réponses. Les retests et les semaines légères validés d'un programme existant sont gardés
 * tant que ses dates ne changent pas ; sinon, ils sont recalculés selon la règle générale de la section 6.
 */
export function creerProgramme(r: ReponsesProgramme, base?: ProgrammeConfig): ProgrammeConfig {
  const memesDates = base && base.debut === r.debut && base.echeance === r.echeance;
  return {
    nom: r.nom.trim() || 'Nouveau programme',
    debut: r.debut,
    echeance: r.echeance,
    echeanceNom: r.echeanceNom.trim() || 'Échéance',
    restrictions: {
      ...(r.sprint ? { sprint: { intensiteMax: r.sprint.intensiteMax, jusquau: r.sprint.jusquau } } : {}),
      ...(r.changementsDeDirectionJusquau ? { changementsDeDirection: { jusquau: r.changementsDeDirectionJusquau } } : {}),
    },
    periodesAllegees: r.periodesAllegees.map((p) => ({ ...p, nom: p.nom.trim() })),
    tournois: [...r.tournois].map((t) => ({ ...t, nom: t.nom.trim() })).sort((a, b) => (a.debut < b.debut ? -1 : 1)),
    matchsReguliers: r.matchsReguliers.map((m) => ({ ...m, nom: m.nom.trim() })),
    retests: memesDates ? base.retests : retestsParDefaut(r),
    semainesLegeres: memesDates ? base.semainesLegeres : [],
    sante: r.sante,
    disponibilites: { seancesParSemaine: r.seancesParSemaine, dureeMax: r.dureeMax, lieux: r.lieux },
    niveau: { etapeCourse: r.etapeCourse, derniereCourse: r.derniereCourse, allures: r.allures, charges: r.charges },
  };
}
