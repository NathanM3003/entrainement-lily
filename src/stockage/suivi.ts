// Suivi de la progression (Règles, section 5 « Fatigue, absences et records » et section 7 « Séries et badges ») :
// records, badges, série de semaines complètes, données des graphiques et bilan de préparation.
// Le poids corporel n'est jamais suivi.

import { exercice } from '../donnees/banque';
import { LIBELLES_PHASES } from '../moteur/types';
import type { DateISO } from '../moteur/dates';
import { chargeRetenue, convertir, distanceCooper, estCourseFacile, estimation1RM, reserve, terminees } from '../moteur/progression';
import type { Phase } from '../moteur/types';
import type { SemaineCalculee } from './saison';
import type { Donnees, ResultatSeance, Unite } from './types';

export interface Point {
  date: DateISO;
  valeur: number;
}

export interface RecordPerso {
  id: string;
  nom: string;
  valeur: number;
  unite: string;
  date: DateISO;
  /** Nombre de fois où le record a été battu. */
  battu: number;
  plusPetitEstMieux: boolean;
}

export type CategorieBadge = 'jalon' | 'record' | 'course' | 'date' | 'tournoi' | 'prevention' | 'intermittents' | 'symetrie' | 'regularite';

export interface Badge {
  id: string;
  nom: string;
  description: string;
  categorie: CategorieBadge;
  /** Date où le badge a été gagné ; absente s'il reste à gagner. */
  date?: DateISO;
}

export interface Suivi {
  serie: { actuelle: number; meilleure: number };
  seancesFaites: number;
  badges: Badge[];
  records: RecordPerso[];
  courbes: {
    force: { id: string; nom: string; points: Point[] }[];
    uniteForce: Unite;
    sprint10: Point[];
    sprint20: Point[];
    saut: Point[];
    courseParSemaine: { semaine: number; minutes: number }[];
    douleurs: { tibias: Point[]; genou: Point[]; chevilles: Point[] };
    cooper: Point[];
  };
}

// ---------- Mesures ----------

const parDate = (a: { date: DateISO }, b: { date: DateISO }) => (a.date < b.date ? -1 : 1);

/** Chaque exercice fait (hors échauffement) d'une séance terminée. */
function* faits(resultats: ResultatSeance[]) {
  for (const r of resultats) {
    for (const b of r.seance.contenu.blocs) {
      if (b.type === 'echauffement') continue;
      for (const p of b.exercices) {
        const x = r.exercices[`${b.type}:${p.id}`];
        if (x?.pasFait) continue;
        yield { r, bloc: b.type, p, x };
      }
    }
  }
}

const moyenneCotes = (m?: { valeur?: number; gauche?: number; droite?: number }) => {
  if (!m) return undefined;
  if (m.valeur !== undefined) return m.valeur;
  const v = [m.gauche, m.droite].filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

/** Résultat d'un test, quel que soit son bloc (le test de sprint est dans le bloc « vitesse » de la séance A). */
const resultatTest = (r: ResultatSeance, test: string) => Object.entries(r.exercices).find(([cle]) => cle.endsWith(`:${test}`))?.[1];

/** Points d'un test de la journée 1 ou du mini-retest. */
function pointsTest(resultats: ResultatSeance[], test: string): Point[] {
  const points: Point[] = [];
  for (const r of resultats) {
    const x = resultatTest(r, test);
    const v = test === 'T-cooper' ? (x?.cooper?.tours !== undefined ? distanceCooper(x.cooper.tours, x.cooper.reste) : undefined) : moyenneCotes(x?.mesure);
    if (x && !x.pasFait && v !== undefined) points.push({ date: r.date, valeur: v });
  }
  return points;
}

/** Maximum estimé (en kg) : tests (charge × 1,2) et dernières séries « + ». */
function points1RM(resultats: ResultatSeance[], id: string, phaseDe: (r: ResultatSeance) => Phase): Point[] {
  const points: Point[] = [];
  for (const r of resultats) {
    const t = r.exercices[`tests:T-${id}`];
    if (t?.mesure && !t.pasFait) {
      const v = [t.mesure.valeur, t.mesure.gauche, t.mesure.droite].filter((x): x is number => chargeRetenue(t, x));
      if (v.length) points.push({ date: r.date, valeur: convertir(Math.min(...v), t.unite ?? 'kg', 'kg') * 1.2 });
    }
  }
  for (const { r, p, x } of faits(resultats)) {
    const derniere = x?.series?.at(-1);
    if (p.id !== id || !p.derniereSeriePlus || !derniere?.reps || !x || !chargeRetenue(x, derniere.charge)) continue;
    points.push({ date: r.date, valeur: estimation1RM(convertir(derniere.charge, x?.unite ?? 'kg', 'kg'), derniere.reps, reserve(phaseDe(r))) });
  }
  return points.sort(parDate);
}

/** Les fois où une valeur dépasse la meilleure d'avant : chaque fois est un record battu. */
function recordsBattus(points: Point[], plusPetitEstMieux: boolean): { meilleur?: Point; battus: Point[] } {
  let meilleur: Point | undefined;
  const battus: Point[] = [];
  for (const p of [...points].sort(parDate)) {
    const mieux = meilleur === undefined ? false : plusPetitEstMieux ? p.valeur < meilleur.valeur : p.valeur > meilleur.valeur;
    if (meilleur === undefined || mieux) {
      if (mieux) battus.push(p);
      meilleur = p;
    }
  }
  return { meilleur, battus };
}

// ---------- Calcul ----------

const PRINCIPAUX = ['F1', 'F7', 'F14', 'F16'];
const PALIERS_SERIE = [4, 8, 12];

export function calculerSuivi(saison: SemaineCalculee[], donnees: Donnees, aujourdhui: DateISO): Suivi {
  const resultats = terminees(donnees, '9999-12-31');
  const semaineDe = new Map(saison.map((s) => [s.semaine.numero, s.semaine]));
  const phaseDe = (r: ResultatSeance): Phase => semaineDe.get(r.semaine)?.phase ?? 'fondation';
  const badges: Badge[] = [];
  const badge = (id: string, nom: string, description: string, categorie: CategorieBadge, date?: DateISO) => badges.push({ id, nom, description, categorie, date });

  // Série : semaines de suite où toutes les séances choisies sont faites (section 7). Semaine en cours : elle compte si elle est complète.
  let actuelle = 0;
  let meilleure = 0;
  const finsSerie: DateISO[] = [];
  for (const s of saison) {
    if (s.semaine.debut > aujourdhui) break;
    const complete = !!s.choix && s.seances.length > 0 && s.seances.every((x) => x.etat === 'faite');
    if (complete) {
      actuelle++;
      if (actuelle > meilleure) {
        meilleure = actuelle;
        finsSerie[actuelle] = s.seances.at(-1)!.seance.date;
      }
    } else if (s.semaine.fin < aujourdhui) actuelle = 0;
  }

  // Jalons.
  for (const n of [1, 10, 25, 50]) {
    badge(`seances-${n}`, n === 1 ? '1re séance' : `${n} séances`, n === 1 ? 'Ta première séance terminée.' : `${n} séances terminées.`, 'jalon', resultats[n - 1]?.date);
  }
  const phases = [...new Set(saison.map((s) => s.semaine.phase))];
  for (const phase of phases) {
    const semaines = saison.filter((s) => s.semaine.phase === phase);
    const fin = semaines.at(-1)!.semaine.fin;
    const faite = resultats.some((r) => phaseDe(r) === phase);
    const gagne = fin < aujourdhui && faite ? fin : undefined;
    if (phase === 'affutage') badge('prete', 'Prête pour la saison', "L'affûtage est terminé : place à la saison !", 'jalon', gagne);
    else badge(`phase-${phase}`, `Phase ${LIBELLES_PHASES[phase]} terminée`, `Toutes les semaines de la phase ${LIBELLES_PHASES[phase]} sont passées.`, 'jalon', gagne);
  }

  // Records (section 5 et 7).
  const records: RecordPerso[] = [];
  const ajouterRecord = (id: string, nom: string, unite: string, points: Point[], plusPetitEstMieux = false) => {
    const { meilleur, battus } = recordsBattus(points, plusPetitEstMieux);
    if (!meilleur) return;
    records.push({ id, nom, valeur: meilleur.valeur, unite, date: meilleur.date, battu: battus.length, plusPetitEstMieux });
    battus.forEach((p, i) => badge(`record-${id}-${i + 1}`, `Record : ${nom}`, `Nouveau record le ${p.date}.`, 'record', p.date));
  };
  const uniteForce: Unite = donnees.preferences.unites.F1 ?? 'kg';
  const force = PRINCIPAUX.map((id) => ({ id, nom: exercice(id).nom, points: points1RM(resultats, id, phaseDe) }));
  for (const f of force) {
    ajouterRecord(`1rm-${f.id}`, `maximum estimé, ${f.nom.toLowerCase()}`, uniteForce, f.points.map((p) => ({ ...p, valeur: Math.round(convertir(p.valeur, 'kg', uniteForce) * 10) / 10 })));
  }
  const sprintsFilmes = (distance: number) =>
    [...faits(resultats)].filter(({ p, x }) => (p.role === 'acceleration' || p.role === 'vitesse-max') && x?.temps && x.distance === distance).map(({ r, x }) => ({ date: r.date, valeur: x!.temps! }));
  const sprint10 = [...pointsTest(resultats, 'T-sprint-10'), ...sprintsFilmes(10)].sort(parDate);
  const sprint20 = [...pointsTest(resultats, 'T-sprint-20'), ...sprintsFilmes(20)].sort(parDate);
  ajouterRecord('sprint-10', 'sprint 10 m', 's', sprint10, true);
  ajouterRecord('sprint-20', 'sprint 20 m', 's', sprint20, true);
  const saut = [
    ...pointsTest(resultats, 'T-saut'),
    ...[...faits(resultats)].filter(({ p, x }) => p.id === 'P5' && x?.distance).map(({ r, x }) => ({ date: r.date, valeur: x!.distance! })),
  ].sort(parDate);
  ajouterRecord('saut', 'saut en longueur', 'cm', saut);
  ajouterRecord(
    'boite',
    'hauteur de boîte',
    'cm',
    [...faits(resultats)].filter(({ p, x }) => p.id === 'P4' && x?.hauteur).map(({ r, x }) => ({ date: r.date, valeur: x!.hauteur! })),
  );
  const cooper = pointsTest(resultats, 'T-cooper');
  ajouterRecord('cooper', 'test demi-Cooper', 'm', cooper);
  ajouterRecord('e8', 'objectif à battre (E8)', 'm', [...faits(resultats)].filter(({ p, x }) => p.id === 'E8' && x?.distance).map(({ r, x }) => ({ date: r.date, valeur: x!.distance! })));
  ajouterRecord(
    'course',
    'course en continu',
    'min',
    [...faits(resultats)].filter(({ p }) => p.role === 'course' && p.id === 'E2').map(({ r, p, x }) => ({ date: r.date, valeur: x?.minutes ?? p.minutes ?? 0 })),
  );

  // Course : 20 min et 30 min sans arrêt, tibias tranquilles.
  const etape = (n: number) => [...faits(resultats)].find(({ p }) => estCourseFacile(p) && Number(/^Étape (\d)/.exec(p.format ?? '')?.[1]) >= n)?.r.date;
  badge('course-20', '20 min sans arrêt', 'Course facile de 20 min en continu (étape 5).', 'course', etape(5));
  badge('course-30', '30 min', 'Course facile de 30 min en continu (étape 7).', 'course', etape(7));
  let tranquilles = 0;
  let tibias: DateISO | undefined;
  for (const s of saison) {
    const courses = resultats.filter((r) => r.semaine === s.semaine.numero && r.seance.contenu.course);
    if (!courses.length) continue;
    const douleur = courses.some((r) => (r.douleurs?.tibias ?? 0) >= 3 || (r.douleursLendemain?.tibias ?? 0) >= 3);
    tranquilles = douleur ? 0 : tranquilles + 1;
    if (tranquilles >= 4 && !tibias) tibias = courses.at(-1)!.date;
  }
  badge('tibias', 'Tibias tranquilles', '4 semaines de course sans douleur aux tibias à 3 ou plus.', 'course', tibias);

  // Dates clés.
  const debutProgramme = resultats[0]?.date;
  const datesCles = saison.flatMap((s) => s.semaine.evenements).filter((e) => e.type === 'sprint-100' || e.type === 'changements-de-direction');
  for (const e of datesCles) {
    const gagne = debutProgramme && e.date <= aujourdhui ? e.date : undefined;
    if (e.type === 'sprint-100') badge('sprint-100', 'Sprint à 100 % débloqué', 'Le sprint à 100 % est permis.', 'date', gagne);
    else badge('changements-de-direction', 'Retour des changements de direction', 'Les changements de direction reviennent.', 'date', gagne);
  }

  // Tournois : un badge pour chacun, une fois passé.
  const tournois = new Map<string, DateISO>();
  for (const e of saison.flatMap((s) => s.semaine.evenements).filter((x) => x.type === 'tournoi')) tournois.set(e.nom, e.date);
  for (const [nom, fin] of tournois) badge(`tournoi-${nom}`, nom, `${nom} joué.`, 'tournoi', fin < aujourdhui && debutProgramme ? fin : undefined);

  // Prévention et intermittents.
  const avecM1 = resultats.filter((r) => r.seance.contenu.blocs.some((b) => b.type === 'prevention' && b.exercices.some((p) => p.id === 'M1' && !r.exercices[`prevention:M1`]?.pasFait)));
  badge('cheville', "Cheville d'acier", '20 séances avec M1, l’exercice de la physio.', 'prevention', avecM1[19]?.date);
  const routines = [...(donnees.routinesMaison ?? [])].sort();
  badge('routine', 'Routine maison', '10 routines de 10 min faites à la maison.', 'prevention', routines[9]);
  const echauffements = resultats.filter((r) => {
    const ids = r.seance.contenu.blocs.find((b) => b.type === 'echauffement')?.exercices.map((p) => p.id) ?? [];
    return ids.length > 0 && ids.every((id) => r.echauffementFait?.includes(id));
  });
  badge('bien-chaud', 'Bien chaud', '10 séances avec l’échauffement fait en entier.', 'prevention', echauffements[9]?.date);
  const intermittents = resultats.filter((r) =>
    r.seance.contenu.blocs.some((b) => b.type === 'intermittents' && b.exercices.some((p) => !r.exercices[`intermittents:${p.id}`]?.pasFait)),
  );
  badge('courage', 'Courage', '10 séances d’intermittents faites.', 'intermittents', intermittents[9]?.date);

  // Symétrie : écart entre les côtés repassé sous 10 % à un retest.
  let symetrie: DateISO | undefined;
  for (const test of ['T-F7', 'T-mollet', 'T-cheville', 'T-saut-une-jambe']) {
    let ecartAvant = false;
    for (const r of resultats) {
      const m = r.exercices[`tests:${test}`]?.mesure;
      if (!m?.gauche || !m.droite) continue;
      const ecart = Math.abs(m.gauche - m.droite) / Math.max(m.gauche, m.droite);
      if (ecart > 0.1) ecartAvant = true;
      else if (ecartAvant && (!symetrie || r.date < symetrie)) symetrie = r.date;
    }
  }
  badge('symetrie', 'Symétrie', 'Un écart entre les côtés repassé sous 10 % au retest.', 'symetrie', symetrie);

  // Régularité.
  for (const n of PALIERS_SERIE) badge(`serie-${n}`, `${n} semaines de suite`, `${n} semaines de suite avec toutes les séances choisies faites.`, 'regularite', finsSerie[n]);

  // Courbes.
  const courseParSemaine = saison
    .filter((s) => s.semaine.debut <= aujourdhui)
    .map((s) => ({
      semaine: s.semaine.numero,
      minutes: [...faits(resultats.filter((r) => r.semaine === s.semaine.numero))]
        .filter(({ p }) => p.role === 'course')
        .reduce((t, { p, x }) => t + (x?.minutes ?? p.minutes ?? 0), 0),
    }));
  const douleur = (zone: 'tibias' | 'genou' | 'chevilles') => resultats.filter((r) => r.douleurs?.[zone] !== undefined).map((r) => ({ date: r.date, valeur: r.douleurs![zone]! }));

  return {
    serie: { actuelle, meilleure },
    seancesFaites: resultats.length,
    badges,
    records,
    courbes: {
      force: force.map((f) => ({ ...f, points: f.points.map((p) => ({ ...p, valeur: Math.round(convertir(p.valeur, 'kg', uniteForce) * 10) / 10 })) })),
      uniteForce,
      sprint10,
      sprint20,
      saut,
      courseParSemaine,
      douleurs: { tibias: douleur('tibias'), genou: douleur('genou'), chevilles: douleur('chevilles') },
      cooper,
    },
  };
}

// ---------- Bilan de préparation (section 6) ----------

export interface LigneBilan {
  test: string;
  nom: string;
  unite: string;
  plusPetitEstMieux: boolean;
  mesures: { date: DateISO; valeur: number; gauche?: number; droite?: number }[];
  /** Différence entre la dernière mesure et la première, et en %. */
  evolution?: { valeur: number; pourcentage: number };
  /** Écart entre les côtés à la dernière mesure, en %. */
  ecartCotes?: number;
}

const TESTS_BILAN: { test: string; nom: string; unite: string; plusPetitEstMieux?: boolean }[] = [
  { test: 'T-cheville', nom: 'Flexion de cheville', unite: 'cm' },
  { test: 'T-saut', nom: 'Saut en longueur', unite: 'cm' },
  { test: 'T-saut-une-jambe', nom: 'Saut sur une jambe', unite: 'cm' },
  { test: 'T-sprint-10', nom: 'Sprint 10 m', unite: 's', plusPetitEstMieux: true },
  { test: 'T-sprint-20', nom: 'Sprint 20 m', unite: 's', plusPetitEstMieux: true },
  { test: 'T-F1', nom: 'Squat arrière (5 répétitions)', unite: 'kg' },
  { test: 'T-F7', nom: 'Squat bulgare (5 répétitions)', unite: 'kg' },
  { test: 'T-F14', nom: 'Développé des épaules (5 répétitions)', unite: 'kg' },
  { test: 'T-F16', nom: 'Tirage horizontal (5 répétitions)', unite: 'kg' },
  { test: 'T-mollet', nom: 'Mollet sur une jambe', unite: 'répétitions' },
  { test: 'T-cooper', nom: 'Test demi-Cooper', unite: 'm' },
];

/** Tous les tests faits, du premier au dernier, avec l'évolution et l'écart entre les côtés. */
export function bilan(donnees: Donnees): LigneBilan[] {
  const resultats = terminees(donnees, '9999-12-31');
  return TESTS_BILAN.map(({ test, nom, unite, plusPetitEstMieux = false }) => {
    const mesures: LigneBilan['mesures'] = [];
    for (const r of resultats) {
      const x = resultatTest(r, test);
      if (!x || x.pasFait) continue;
      const kg = (v?: number) => (v === undefined ? undefined : unite === 'kg' ? Math.round(convertir(v, x.unite ?? 'kg', 'kg') * 10) / 10 : v);
      if (test === 'T-cooper') {
        if (x.cooper?.tours !== undefined) mesures.push({ date: r.date, valeur: distanceCooper(x.cooper.tours, x.cooper.reste) });
        continue;
      }
      const valeur = kg(moyenneCotes(x.mesure));
      if (valeur !== undefined) mesures.push({ date: r.date, valeur, gauche: kg(x.mesure?.gauche), droite: kg(x.mesure?.droite) });
    }
    const premiere = mesures[0];
    const derniere = mesures.at(-1);
    const ligne: LigneBilan = { test, nom, unite, plusPetitEstMieux, mesures };
    if (premiere && derniere && mesures.length > 1) {
      const valeur = Math.round((derniere.valeur - premiere.valeur) * 100) / 100;
      ligne.evolution = { valeur, pourcentage: Math.round((valeur / premiere.valeur) * 1000) / 10 };
    }
    if (derniere?.gauche && derniere.droite) ligne.ecartCotes = Math.round((Math.abs(derniere.gauche - derniere.droite) / Math.max(derniere.gauche, derniere.droite)) * 100);
    return ligne;
  });
}

// ---------- Comment va le plan (accueil et écran Progrès) ----------

export interface EtatDuPlan {
  semaine: number;
  totalSemaines: number;
  phase: string;
  joursAvantEcheance: number;
  /** Séances faites, et séances prévues dont le jour est passé (ou aujourd'hui). */
  seancesFaites: number;
  seancesPassees: number;
  /** % des séances prévues jusqu'ici qui ont été faites. */
  regularite?: number;
  prochainTest?: { date?: DateISO; semaine: number; nom: string };
  minutes: number;
  sauts: number;
  sprints: number;
  /** Total soulevé (charge × répétitions), en kg. */
  tonnage: number;
}

const NOMS_TESTS = { journee1: 'Tests de la journée 1', sprint: 'Test de sprint', mini: 'Mini-retest', cooper: 'Test demi-Cooper' } as const;

export function etatDuPlan(saison: SemaineCalculee[], donnees: Donnees, aujourdhui: DateISO, echeance: DateISO): EtatDuPlan {
  const actuelle = saison.find((s) => aujourdhui >= s.semaine.debut && aujourdhui <= s.semaine.fin) ?? (aujourdhui < (saison[0]?.semaine.debut ?? '') ? saison[0] : saison.at(-1));
  const resultats = terminees(donnees, '9999-12-31');
  const passees = saison.flatMap((s) => s.seances).filter((x) => x.seance.date <= aujourdhui);
  const faitesPassees = passees.filter((x) => x.etat === 'faite').length;
  let prochainTest: EtatDuPlan['prochainTest'];
  for (const s of saison) {
    if (s.semaine.fin < aujourdhui) continue;
    const seance = s.seances.find((x) => x.seance.test && x.seance.date >= aujourdhui && x.etat !== 'faite');
    if (seance) {
      prochainTest = { date: seance.seance.date, semaine: s.semaine.numero, nom: NOMS_TESTS[seance.seance.test!] };
      break;
    }
    const r = s.semaine.retests.find((x) => x.moment !== 'condition' && !s.seances.some((y) => y.seance.test === x.type && y.etat === 'faite'));
    if (r && !s.choix) {
      prochainTest = { semaine: s.semaine.numero, nom: NOMS_TESTS[r.type] };
      break;
    }
  }
  let sauts = 0;
  let sprints = 0;
  let tonnage = 0;
  for (const { p, x } of faits(resultats)) {
    if (p.role === 'plio') sauts += x?.nombre ?? p.sauts ?? 0;
    if (p.role === 'acceleration' || p.role === 'vitesse-max') sprints += x?.nombre ?? p.reps?.min ?? 0;
    for (const serie of x?.series ?? []) if (x && chargeRetenue(x, serie.charge) && serie.reps) tonnage += convertir(serie.charge, x?.unite ?? 'kg', 'kg') * serie.reps * (p.parCote ? 2 : 1);
  }
  const debut = saison[0]?.semaine.debut ?? aujourdhui;
  return {
    semaine: actuelle?.semaine.numero ?? 1,
    totalSemaines: saison.length,
    phase: actuelle ? LIBELLES_PHASES[actuelle.semaine.phase] : '',
    joursAvantEcheance: Math.max(0, Math.round((Date.parse(echeance) - Date.parse(aujourdhui < debut ? aujourdhui : aujourdhui)) / 86_400_000)),
    seancesFaites: resultats.length,
    seancesPassees: passees.length,
    regularite: passees.length ? Math.round((faitesPassees / passees.length) * 100) : undefined,
    prochainTest,
    minutes: resultats.reduce((t, r) => t + r.seance.contenu.minutes, 0),
    sauts,
    sprints,
    tonnage: Math.round(tonnage),
  };
}

// ---------- Bilan de la semaine ----------

export interface BilanSemaine {
  numero: number;
  faites: number;
  prevues: number;
  minutes: number;
  effortMoyen?: number;
  records: string[];
  badges: string[];
  /** Douleurs de 3 ou plus notées cette semaine, par zone (la plus forte). */
  douleurs: { zone: string; note: number }[];
  matchs: number;
  message: string;
}

const NOMS_ZONES = { tibias: 'tibias', genou: 'arrière du genou', chevilles: 'chevilles' } as const;

/** Résumé d'une semaine, avec un message pour la suite. */
export function bilanSemaine(s: SemaineCalculee, suivi: Suivi, donnees: Donnees): BilanSemaine {
  const resultats = s.seances.map((x) => x.resultat).filter((r): r is ResultatSeance => !!r?.terminee);
  const dansSemaine = (d?: DateISO) => !!d && d >= s.semaine.debut && d <= s.semaine.fin;
  const efforts = resultats.map((r) => r.effort).filter((e): e is number => e !== undefined);
  const douleurs: BilanSemaine['douleurs'] = [];
  for (const zone of Object.keys(NOMS_ZONES) as (keyof typeof NOMS_ZONES)[]) {
    const max = Math.max(0, ...resultats.map((r) => r.douleurs?.[zone] ?? 0));
    if (max >= 3) douleurs.push({ zone: NOMS_ZONES[zone], note: max });
  }
  const records = [...new Set(suivi.badges.filter((b) => b.categorie === 'record' && dansSemaine(b.date)).map((b) => b.nom.replace(/^Record : /, '')))];
  const badges = suivi.badges.filter((b) => b.categorie !== 'record' && dansSemaine(b.date)).map((b) => b.nom);
  const prevues = s.seances.length;
  const faites = resultats.length;
  const message =
    prevues === 0
      ? 'Pas de séance prévue cette semaine. On repart la semaine prochaine.'
      : faites === prevues
        ? `Semaine complète, bravo ! ${suivi.serie.actuelle > 1 ? `${suivi.serie.actuelle} semaines de suite.` : 'Ta série commence.'}`
        : faites === 0
          ? "Semaine sans séance : ça arrive. Pas de rattrapage, on reprend la semaine prochaine."
          : `${faites} séance${faites > 1 ? 's' : ''} sur ${prevues} : chaque séance compte, continue comme ça.`;
  return {
    numero: s.semaine.numero,
    faites,
    prevues,
    minutes: resultats.reduce((t, r) => t + r.seance.contenu.minutes, 0),
    effortMoyen: efforts.length ? Math.round((efforts.reduce((a, b) => a + b, 0) / efforts.length) * 10) / 10 : undefined,
    records,
    badges,
    douleurs,
    matchs: (s.plan?.matchs ?? []).filter((m) => (donnees.notesMatchs ?? {})[m.date] !== undefined || m.date <= s.semaine.fin).length,
    message,
  };
}
