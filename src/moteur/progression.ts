// Progression automatique (Règles du programme, sections 5 et 7) : charges, course facile, sprints,
// niveaux de pliométrie, douleurs. Tout est calculé à partir des résultats entrés par Lily.

import { exercice } from '../donnees/banque';
import type { Donnees, ResultatExercice, ResultatSeance, Unite } from '../stockage/types';
import type { Prescription, SeanceDetaillee } from './contenu';
import { ajouterJours, ecartJours, type DateISO } from './dates';
import type { Calendrier, Phase, Semaine } from './types';

// ---------- Matériel et crans (section 5, « Un cran ») ----------

export type Materiel = 'barre' | 'halteres' | 'kettlebell' | 'machine';

export const LIBELLES_MATERIEL: Record<Materiel, string> = {
  barre: 'Barre',
  halteres: 'Haltères',
  kettlebell: 'Kettlebells',
  machine: 'Machines et poulies',
};

/** Écart entre deux poids disponibles. Lily peut les changer selon son gym. */
export const CRANS_PAR_DEFAUT: Record<Materiel, Record<Unite, number>> = {
  barre: { kg: 2.5, lb: 5 },
  halteres: { kg: 2, lb: 5 },
  kettlebell: { kg: 4, lb: 5 },
  machine: { kg: 5, lb: 10 },
};

const MATERIEL: Record<string, Materiel> = {
  F1: 'barre',
  F2: 'machine',
  F10: 'machine',
  F16: 'machine',
  F18: 'machine',
  F21: 'machine',
  F23: 'machine',
  F11: 'kettlebell',
  F26: 'kettlebell',
};
export const materielDe = (id: string): Materiel => MATERIEL[id] ?? 'halteres';

export function cran(id: string, unite: Unite, donnees: Donnees): number {
  const m = materielDe(id);
  return donnees.preferences.crans?.[m]?.[unite] ?? CRANS_PAR_DEFAUT[m][unite];
}

/** Exercices sans charge (poids du corps). */
const SANS_CHARGE = new Set(['F13', 'F19', 'F20', 'F22', 'A2']);
export const avecCharge = (p: Pick<Prescription, 'id' | 'secondes'>) =>
  p.id === 'A3' || (p.id.startsWith('F') && !SANS_CHARGE.has(p.id) && !p.secondes);

const LB_PAR_KG = 2.2046226218;
export const convertir = (charge: number, de: Unite, vers: Unite) => (de === vers ? charge : de === 'kg' ? charge * LB_PAR_KG : charge / LB_PAR_KG);
const arrondiBas = (x: number, pas: number) => Math.max(pas, Math.floor(x / pas + 1e-9) * pas);

// ---------- 1RM estimé (section 7) ----------

/** Répétitions gardées en réserve à la dernière série « + » : 2 en Fondation, 1 ensuite. */
export const reserve = (phase: Phase) => (phase === 'fondation' ? 2 : 1);

/** 1RM estimé = charge × (1 + (répétitions + répétitions en réserve) ÷ 30). */
export const estimation1RM = (charge: number, reps: number, enReserve: number) => charge * (1 + (reps + enReserve) / 30);

interface Performance {
  date: DateISO;
  phase: Phase;
  p: Prescription;
  r: ResultatExercice;
  effort?: number;
}

const phaseDe = (cal: Calendrier, r: ResultatSeance): Phase => cal.semaines[r.semaine - 1]?.phase ?? 'fondation';

function terminees(donnees: Donnees, avant: DateISO): ResultatSeance[] {
  return Object.values(donnees.resultats)
    .filter((r) => r.terminee && r.date < avant)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Les fois où l'exercice a été fait (hors échauffement), du plus ancien au plus récent. */
function performances(cal: Calendrier, donnees: Donnees, id: string, avant: DateISO): Performance[] {
  const liste: Performance[] = [];
  for (const res of terminees(donnees, avant)) {
    for (const bloc of res.seance.contenu.blocs) {
      if (bloc.type === 'echauffement') continue;
      for (const p of bloc.exercices) {
        if (p.id !== id) continue;
        const r = res.exercices[`${bloc.type}:${id}`];
        if (!r || r.pasFait) continue;
        liste.push({ date: res.date, phase: phaseDe(cal, res), p, r, effort: res.effort });
      }
    }
  }
  return liste;
}

const charges = (r: ResultatExercice) => (r.series ?? []).map((s) => s.charge).filter((c): c is number => typeof c === 'number' && c > 0);

/** Maximum estimé, en kg : tests de la journée 1 (charge pour 5 répétitions, 1 en réserve) et dernières séries « + ». */
export function maximumEstime(cal: Calendrier, donnees: Donnees, id: string, avant: DateISO): number | undefined {
  let dernier: { date: DateISO; kg: number } | undefined;
  for (const res of terminees(donnees, avant)) {
    const test = res.exercices[`tests:T-${id}`];
    if (test?.mesure && !test.pasFait) {
      const valeurs = [test.mesure.valeur, test.mesure.gauche, test.mesure.droite].filter((v): v is number => typeof v === 'number' && v > 0);
      // Squat bulgare : le côté le plus faible, par prudence.
      if (valeurs.length) dernier = { date: res.date, kg: convertir(Math.min(...valeurs), test.unite ?? 'kg', 'kg') * 1.2 };
    }
  }
  for (const perf of performances(cal, donnees, id, avant)) {
    const derniere = perf.r.series?.at(-1);
    if (!perf.p.derniereSeriePlus || !derniere?.reps || !derniere.charge) continue;
    if (!dernier || perf.date >= dernier.date) {
      dernier = { date: perf.date, kg: estimation1RM(convertir(derniere.charge, perf.r.unite ?? 'kg', 'kg'), derniere.reps, reserve(perf.phase)) };
    }
  }
  return dernier?.kg;
}

// ---------- Charge prévue (sections 5 et 7) ----------

export interface ChargePrevue {
  charge: number;
  unite: Unite;
  /** Répétitions visées, quand on ajoute des répétitions avant de monter la charge. */
  reps?: number;
  explication: string;
}

const nombre = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 1 });

/** Dernier jour d'entraînement avant cette date. */
export function dernierEntrainement(donnees: Donnees, avant: DateISO): DateISO | undefined {
  return terminees(donnees, avant).at(-1)?.date;
}

/**
 * Charge à prévoir pour un exercice, d'après les résultats d'avant.
 * - Mouvements testés, première séance de la phase : % du maximum estimé, −5 %.
 * - Nouvelle fourchette de répétitions : charge recalculée à partir du maximum estimé.
 * - Sinon : tableau de la dernière série « + », avec les garde-fous.
 * Renvoie undefined quand la charge est à trouver.
 */
export function chargePrevue(cal: Calendrier, donnees: Donnees, date: DateISO, phase: Phase, p: Prescription): ChargePrevue | undefined {
  if (!avecCharge(p)) return undefined;
  const perfs = performances(cal, donnees, p.id, date);
  const derniere = perfs.at(-1);
  const unite: Unite = donnees.preferences.unites[p.id] ?? derniere?.r.unite ?? 'kg';
  const pas = cran(p.id, unite, donnees);
  const dansUnite = (perf: Performance) => {
    const c = charges(perf.r);
    return c.length ? convertir(Math.max(...c), perf.r.unite ?? 'kg', unite) : undefined;
  };

  let resultat: ChargePrevue | undefined;
  const dejaCettePhase = perfs.some((x) => x.phase === phase);

  if (phase === 'affutage') {
    // La dernière charge lourde utilisée.
    const lourde = [...perfs].reverse().map(dansUnite).find((c) => c !== undefined);
    if (lourde !== undefined) resultat = { charge: arrondiBas(lourde, pas), unite, explication: 'Ta dernière charge lourde.' };
  } else if (p.pourcentage1RM && !dejaCettePhase) {
    const max = maximumEstime(cal, donnees, p.id, date);
    if (max !== undefined) {
      const kg = (max * p.pourcentage1RM) / 100 * (p.moinsCinqPourcent ? 0.95 : 1);
      resultat = {
        charge: arrondiBas(convertir(kg, 'kg', unite), pas),
        unite,
        explication: `${p.pourcentage1RM} % de ton maximum estimé (${nombre(convertir(max, 'kg', unite))} ${unite})${p.moinsCinqPourcent ? ', moins 5 % pour la 1re séance de la phase' : ''}.`,
      };
    }
  } else if (derniere) {
    const base = dansUnite(derniere);
    if (base === undefined) return undefined;
    const repsAvant = derniere.p.reps?.min;
    const repsMaintenant = p.reps?.min;
    if (repsAvant && repsMaintenant && repsAvant !== repsMaintenant && p.derniereSeriePlus) {
      // Nouvelle fourchette (changement de phase) : on repasse par le maximum estimé.
      const max = maximumEstime(cal, donnees, p.id, date);
      if (max !== undefined) {
        const kg = max / (1 + (repsMaintenant + reserve(phase)) / 30);
        resultat = { charge: arrondiBas(convertir(kg, 'kg', unite), pas), unite, explication: 'Nouvelle fourchette de répétitions : charge recalculée à partir de ton maximum estimé.' };
      }
    }
    resultat ??= progresser(p, derniere, perfs.at(-2), base, unite, pas);
  }
  if (!resultat) return undefined;

  // Retour après 10 jours ou plus sans entraînement : −20 % (section 5).
  const dernierJour = dernierEntrainement(donnees, date);
  if (dernierJour && ecartJours(dernierJour, date) >= 10) {
    resultat = { ...resultat, charge: arrondiBas(resultat.charge * 0.8, pas), explication: `${resultat.explication} Retour après ${ecartJours(dernierJour, date)} jours sans entraînement : −20 %.` };
  }
  return resultat;
}

/** Tableau de la dernière série « + » et garde-fous (section 5). */
function progresser(p: Prescription, derniere: Performance, avantDerniere: Performance | undefined, base: number, unite: Unite, pas: number): ChargePrevue {
  const prevuDe = (perf: Performance) => perf.r.prevu?.reps ?? perf.p.reps?.min ?? 0;
  const manquees = (perf: Performance) => (perf.r.series ?? []).some((s) => (s.reps ?? 0) < prevuDe(perf));
  const prevu = prevuDe(derniere);
  let crans = 0;
  let explication: string;
  let plus = 0;

  if (p.role === 'puissance') {
    // Puissance : +1 cran quand toutes les répétitions ont été faites deux séances de suite.
    const deuxFois = avantDerniere && !manquees(derniere) && !manquees(avantDerniere);
    crans = deuxFois ? 1 : 0;
    explication = deuxFois ? 'Toutes les répétitions faites deux séances de suite : +1 cran.' : 'Même charge tant que toutes les répétitions ne sont pas faites deux séances de suite.';
  } else if (manquees(derniere)) {
    crans = avantDerniere && manquees(avantDerniere) ? -1 : 0;
    explication = crans < 0 ? 'Répétitions manquées deux séances de suite : −1 cran.' : 'Répétitions manquées la dernière fois : même charge.';
  } else if (!p.derniereSeriePlus) {
    explication = 'Même charge que la dernière fois.';
  } else {
    plus = (derniere.r.series?.at(-1)?.reps ?? prevu) - prevu;
    crans = plus >= 4 ? 2 : plus >= 1 ? 1 : 0;
    explication =
      crans === 2
        ? `Dernière série : ${plus} répétitions de plus que prévu, +2 crans.`
        : crans === 1
          ? `Dernière série : ${plus} répétition${plus > 1 ? 's' : ''} de plus que prévu, +1 cran.`
          : 'Dernière série faite comme prévu : même charge.';
  }

  if (crans > 0 && (derniere.effort ?? 0) >= 9) {
    crans = 0;
    explication = 'Effort de 9 ou plus à la dernière séance : pas de hausse cette fois.';
  }

  let reps: number | undefined;
  if (crans > 0) {
    // Jamais plus de 10 % de hausse : si le poids suivant est trop loin, on ajoute d'abord des répétitions.
    while (crans > 0 && base + crans * pas > base * 1.1 + 1e-9) crans--;
    if (crans === 0) {
      const max = p.reps?.max ?? prevu;
      if (prevu < max) {
        reps = prevu + 1;
        explication = `Le poids suivant ferait plus de 10 % de hausse : même charge, vise ${reps} répétitions.`;
      } else {
        crans = 1;
        explication = 'Haut de la fourchette atteint : poids suivant.';
      }
    } else if (plus >= 4 && crans === 1) {
      explication = `Dernière série : ${plus} répétitions de plus que prévu, +1 cran (10 % de hausse au plus).`;
    }
  }
  return { charge: Math.max(pas, base + crans * pas), unite, reps, explication };
}

// ---------- Progression d'une semaine à l'autre ----------

/** Ce qui avance de semaine en semaine : étape de course, volume de sprints, niveau de pliométrie. */
export interface EtatProgression {
  /** Étape de course facile (1 à 7, section 5). */
  etapeCourse: number;
  /** Sprints en plus du bas de la fourchette, dans la phase en cours. */
  sprintsEnPlus: number;
  phaseSprints?: Phase;
  /** Niveau de pliométrie permis (1 à 4). */
  niveauPlio: number;
  /** Séances complètes, sans douleur aux chevilles, faites au niveau permis. */
  seancesAuNiveau: number;
  dernierJour?: DateISO;
}

/** Étape de départ : la dernière course de Lily, 4 × (3 min / 1 min), correspond à l'étape 1. */
export const PROGRESSION_INITIALE: EtatProgression = { etapeCourse: 1, sprintsEnPlus: 0, niveauPlio: 2, seancesAuNiveau: 0 };

/** Seuils de douleur (section 5) : 3 ou 4 = on garde, 5 ou plus = on recule. Le lendemain matin, 3 ou plus compte comme une douleur. */
const SEUIL_RECUL = 5;
const SEUIL_LENDEMAIN = 3;

export const niveauDe = (id: string): number => {
  const e = exercice(id);
  const m = 'categorie' in e ? /Niveau (\d)/.exec(e.categorie) : null;
  return m ? Number(m[1]) : 0;
};

const estCourseFacile = (p: Prescription) => p.role === 'course' && (p.format ?? '').startsWith('Étape');
const estSprint = (p: Prescription) => p.role === 'acceleration' || p.role === 'vitesse-max';

/** Douleurs de course (tibias et arrière du genou, traité comme les tibias). */
function douleurCourse(r: ResultatSeance): 'recul' | 'garde' | 'ok' {
  const apres = Math.max(r.douleurs?.tibias ?? 0, r.douleurs?.genou ?? 0);
  const matin = Math.max(r.douleursLendemain?.tibias ?? 0, r.douleursLendemain?.genou ?? 0);
  if (apres >= SEUIL_RECUL || matin >= SEUIL_LENDEMAIN) return 'recul';
  if (apres >= 3) return 'garde';
  return 'ok';
}

/** Met à jour l'état après une semaine, à partir de ses séances prévues et de leurs résultats. */
export function apresSemaine(etat: EtatProgression, semaine: Semaine, seances: { seance: SeanceDetaillee; resultat?: ResultatSeance }[]): EtatProgression {
  const suivant = { ...etat };
  if (suivant.phaseSprints !== semaine.phase) {
    suivant.phaseSprints = semaine.phase;
    suivant.sprintsEnPlus = 0;
  }
  const faites = seances.filter((s) => s.resultat?.terminee).map((s) => s.resultat!);
  const legere = semaine.legere?.etendue === 'complete';

  // Retour après 10 jours ou plus sans entraînement : la course recule d'une étape.
  const premier = faites[0];
  if (premier && etat.dernierJour && ecartJours(etat.dernierJour, premier.date) >= 10) suivant.etapeCourse = Math.max(1, suivant.etapeCourse - 1);

  // Course facile : au plus une étape par semaine, seulement si toutes les courses prévues sont faites sans douleur.
  const avecCourse = seances.filter((s) => s.seance.contenu.blocs.some((b) => b.exercices.some(estCourseFacile)));
  if (avecCourse.length) {
    const douleurs = avecCourse.map((s) => (s.resultat?.terminee ? douleurCourse(s.resultat) : 'ok'));
    const toutesFaites = avecCourse.every((s) => {
      const r = s.resultat;
      if (!r?.terminee) return false;
      return s.seance.contenu.blocs.every((b) => b.exercices.filter(estCourseFacile).every((p) => !r.exercices[`${b.type}:${p.id}`]?.pasFait));
    });
    if (douleurs.includes('recul')) suivant.etapeCourse = Math.max(1, suivant.etapeCourse - 1);
    else if (!douleurs.includes('garde') && toutesFaites && !legere) suivant.etapeCourse = Math.min(7, suivant.etapeCourse + 1);
  }

  // Sprints : +1 la semaine suivante quand la séance de vitesse est faite en entier, sans tension.
  const avecSprints = seances.filter((s) => s.seance.contenu.blocs.some((b) => b.exercices.some(estSprint)));
  const sprintsComplets =
    avecSprints.length > 0 &&
    avecSprints.every((s) => {
      const r = s.resultat;
      if (!r?.terminee) return false;
      return s.seance.contenu.blocs.every((b) =>
        b.exercices.filter(estSprint).every((p) => {
          const x = r.exercices[`${b.type}:${p.id}`];
          return x && !x.pasFait && !x.tension && (x.nombre ?? 0) >= (p.reps?.min ?? 0);
        }),
      );
    });
  if (sprintsComplets && !legere) suivant.sprintsEnPlus += 1;

  // Pliométrie : niveau suivant après 2 séances complètes avec une douleur aux chevilles de 2 ou moins.
  for (const s of seances) {
    const r = s.resultat;
    const plio = s.seance.contenu.blocs.filter((b) => b.type === 'pliometrie').flatMap((b) => b.exercices.filter((p) => p.role === 'plio').map((p) => ({ b, p })));
    if (!r?.terminee || plio.length === 0) continue;
    const niveau = Math.max(...plio.map(({ p }) => niveauDe(p.id)));
    const chevilles = r.douleurs?.chevilles ?? 0;
    const complete = plio.every(({ b, p }) => !r.exercices[`${b.type}:${p.id}`]?.pasFait);
    if (chevilles >= SEUIL_RECUL) {
      suivant.niveauPlio = Math.max(1, niveau - 1);
      suivant.seancesAuNiveau = 0;
    } else if (chevilles <= 2 && complete && niveau >= suivant.niveauPlio) {
      suivant.seancesAuNiveau += 1;
      if (suivant.seancesAuNiveau >= 2 && suivant.niveauPlio < 4) {
        suivant.niveauPlio += 1;
        suivant.seancesAuNiveau = 0;
      }
    }
  }

  if (faites.length) suivant.dernierJour = faites.at(-1)!.date;
  return suivant;
}

// ---------- Douleurs et tension : effets immédiats ----------

export interface SuiviDouleurs {
  /** La prochaine course facile après cette date passe sur vélo ou rameur. */
  courseEnCardioApres?: DateISO;
  /** Pas de V3 ni de vitesse maximale jusqu'à cette date (tension derrière la cuisse ou le genou). */
  vitesseMaxEnPauseJusquau?: DateISO;
  pauseCourse: boolean;
  pausePlio: boolean;
  alertes: string[];
}

const ZONES = { tibias: 'aux tibias', genou: "à l'arrière du genou", chevilles: 'aux chevilles' } as const;

export function suiviDouleurs(donnees: Donnees): SuiviDouleurs {
  const faites = terminees(donnees, '9999-12-31');
  const suivi: SuiviDouleurs = { pauseCourse: false, pausePlio: false, alertes: [] };

  // Douleur de 5 ou plus après une course, ou douleur le lendemain : la course suivante devient du cardio sans impact.
  for (const r of faites) {
    const aCouru = r.seance.contenu.blocs.some((b) => b.exercices.some(estCourseFacile));
    if (aCouru && douleurCourse(r) === 'recul') suivi.courseEnCardioApres = r.date;
  }
  if (suivi.courseEnCardioApres) {
    const apres = suivi.courseEnCardioApres;
    const consommee = faites.some((r) => r.date > apres && r.seance.contenu.blocs.some((b) => b.exercices.some((p) => p.remplaceCourse || estCourseFacile(p))));
    if (consommee) suivi.courseEnCardioApres = undefined;
  }

  // Tension derrière la cuisse ou le genou pendant les sprints : 1 semaine sans V3 ni vitesse maximale.
  for (const r of faites) {
    if (Object.values(r.exercices).some((x) => x.tension)) suivi.vitesseMaxEnPauseJusquau = ajouterJours(r.date, 7);
  }

  // 5 ou plus pendant plus d'une semaine : pause des exercices liés à la zone, et conseil de voir la physio.
  for (const zone of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
    const notes: { date: DateISO; v: number }[] = [];
    for (const r of faites) {
      if (r.douleurs?.[zone] !== undefined) notes.push({ date: r.date, v: r.douleurs[zone]! });
      if (r.douleursLendemain?.[zone] !== undefined) notes.push({ date: ajouterJours(r.date, 1), v: r.douleursLendemain[zone]! });
    }
    notes.sort((a, b) => (a.date < b.date ? -1 : 1));
    let debut: DateISO | undefined;
    for (const n of notes) debut = n.v >= SEUIL_RECUL ? (debut ?? n.date) : undefined;
    const derniere = notes.at(-1);
    if (debut && derniere && ecartJours(debut, derniere.date) >= 7) {
      if (zone === 'chevilles') suivi.pausePlio = true;
      else suivi.pauseCourse = true;
      suivi.alertes.push(
        `Douleur de 5 ou plus ${ZONES[zone]} depuis plus d'une semaine : ${zone === 'chevilles' ? 'la pliométrie est en pause' : 'la course est en pause (vélo ou rameur)'}. Va voir la physio.`,
      );
    }
  }
  return suivi;
}
