// Placement des séances d'une semaine (Règles du programme, sections 2, 3 et 4).
//
// Lily donne le nombre de séances (1 à 4) et ses jours disponibles. Le moteur choisit les jours,
// le type de chaque séance et sa variante, puis explique ce qu'il a dû changer.
//
// Méthode : on essaie toutes les façons de placer les séances sur les jours disponibles
// (au plus 7 × 6 × 5 × 4 cas), on garde celles qui respectent les règles et on choisit la meilleure.
// Si aucune ne marche, on refait le calcul avec une séance de moins (section 4, « Retrait »).

import { ajouterJours, ecartJours, joursEntre, type DateISO } from './dates';
import type { Calendrier, Evenement, Phase, RetestPrevu, Semaine, TypeRetest } from './types';

export type TypeSeance = 'A' | 'B' | 'C' | 'D' | 'U';
export type Charge = 'elevee' | 'moyenne' | 'faible';

export interface ChoixSemaine {
  /** Nombre de séances voulu, de 1 à 4. */
  nbSeances: number;
  joursDisponibles: DateISO[];
  /** Matchs déclarés en plus des matchs réguliers (match imprévu, ligue du jeudi…). */
  matchsSupplementaires?: DateISO[];
  /** Matchs réguliers qui n'auront pas lieu. */
  matchsAnnules?: DateISO[];
  /** Jours où Lily manque de temps : la séance de ce jour-là est en version express. */
  express?: DateISO[];
  /**
   * Semaine changée en cours de route (section 4, « Retirer ou ajouter une séance ») : jour du changement.
   * Les séances déjà faites restent, les autres sont placées à partir de ce jour.
   */
  depuis?: DateISO;
  /**
   * Lieu possible chaque jour (demande de Lily, 18 novembre 2026) : « gym » ou « piste » seulement.
   * Un jour absent accepte les deux. Le gym n'a pas de piste : sprints et musculation ne se font jamais le même jour.
   */
  lieux?: Record<DateISO, LieuSeance>;
}

/** Où se fait une séance : au gym (musculation, sauts, tapis, vélo) ou sur la piste (sprints, intermittents, agilité). */
export type LieuSeance = 'gym' | 'piste';

/** Ce qu'il faut savoir de la semaine précédente : ses séances, pour ne pas enchaîner dimanche et lundi. */
export type SeancesPrecedentes = Pick<SeancePlanifiee, 'date' | 'charge' | 'course'>[];

export interface SeancePlanifiee {
  date: DateISO;
  type: TypeSeance;
  libelle: string;
  /** « sans-course » : la course ou les intermittents passent sur vélo ou rameur (E10). */
  variante: 'normale' | 'sans-course';
  /** Fondation à 2 séances : contenu de la colonne « 2 » de la section 2. */
  deuxSeances: boolean;
  test?: TypeRetest;
  charge: Charge;
  course: boolean;
  /** Durée maximale en minutes. */
  dureeMax: number;
  /** Semaine de tournoi : version courte, sans record. */
  courte: boolean;
  /** Lily manque de temps ce jour-là : version express d'environ 40 min. */
  express?: boolean;
  /** Gym ou piste (absent dans les séances enregistrées avant le 18 novembre 2026). */
  lieu?: LieuSeance;
}

export interface PlanSemaine {
  numero: number;
  seances: SeancePlanifiee[];
  /** Matchs et jours de tournoi de la semaine. */
  matchs: Evenement[];
  messages: string[];
}

// ---------- Composition selon le nombre de séances (section 2) ----------

interface Modele {
  type: TypeSeance;
  deuxSeances: boolean;
  test?: RetestPrevu;
}

const PHASES_2_ET_3: Phase[] = ['force-vitesse', 'puissance-repetition', 'developpement', 'maintien'];

function composer(phase: Phase, n: number): Modele[] {
  const m = (type: TypeSeance, deuxSeances = false): Modele => ({ type, deuxSeances });
  if (n <= 1) return [m('U')];
  // 2 séances : la piste, puis le gym avec la force complète (pliométrie, jambes, développé, tirage).
  if (n === 2) return [m('A', true), m('B', true)];
  if (n === 3) return [m('A'), m('B'), m('C')];
  return [m('A'), m('B'), m('C'), m('D')];
}

/**
 * Tests (section 6, « Retests », corrigé le 18 novembre 2026 : le gym n'a pas de piste) :
 * - les tests de la journée 1 se font au gym et remplacent B (ou la séance unique) ;
 *   sans sprint (S1, sprint encore limité), ils gardent la place de A ;
 * - leur sprint de 10 et 20 m passe au début de la séance piste (A) de la semaine ;
 * - le test de sprint seul va dans A, le test demi-Cooper remplace C.
 * Un test prévu n'est jamais retiré : s'il n'y a pas de séance C, le test demi-Cooper prend la place
 * de la séance la moins prioritaire.
 */
function ajouterTests(modeles: Modele[], semaine: Semaine): Modele[] {
  const cooper = semaine.retests.find((r) => r.type === 'cooper' && r.moment !== 'condition');
  if (cooper && !modeles.some((m) => m.type === 'C')) {
    const derniere = modeles.length - 1;
    modeles = modeles.map((m, i) => (i === derniere ? { type: 'C', deuxSeances: false } : m));
  }
  const journee1 = semaine.retests.find((r) => r.type === 'journee1');
  const sprintSeul = semaine.retests.find((r) => r.type === 'sprint');
  const sprint: RetestPrevu | undefined =
    sprintSeul ?? (journee1 && !journee1.sansSprint ? { type: 'sprint', moment: 'semaine', semaine: journee1.semaine } : undefined);
  // Journée 1 sans sprint (S1, sprint encore limité) : elle garde la place de A, comme avant.
  const typeJournee1: TypeSeance = journee1?.sansSprint ? 'A' : modeles.some((m) => m.type === 'B') ? 'B' : 'U';
  return modeles.map((mod) => {
    let test: RetestPrevu | undefined;
    if (journee1 && (mod.type === typeJournee1 || (mod.type === 'U' && typeJournee1 !== 'U' && !modeles.some((m) => m.type === typeJournee1)))) test = journee1;
    else if (sprint && mod.type === 'A') test = sprint;
    else if (sprint && mod.type === 'U' && !journee1) test = sprint;
    else if (cooper && mod.type === 'C') test = cooper;
    return test ? { ...mod, test } : mod;
  });
}

const LIBELLES: Record<'fondation' | 'phases23' | 'affutage', Record<TypeSeance, string>> = {
  fondation: {
    A: 'Vitesse + course facile',
    B: 'Pliométrie + force du bas du corps',
    C: 'Force du haut du corps + course facile',
    D: 'Force du haut du corps et tronc + cardio sans impact',
    U: 'Vitesse + force complète',
  },
  phases23: {
    A: 'Vitesse + intermittents',
    B: 'Pliométrie + force du bas du corps',
    C: 'Force du haut du corps + course facile',
    D: 'Force du haut du corps et tronc + cardio sans impact',
    U: 'Vitesse + force complète',
  },
  affutage: {
    A: 'Vitesse (affûtage)',
    B: 'Pliométrie + force (affûtage)',
    C: 'Simulation de points + mobilité (affûtage)',
    D: 'Force du haut du corps et tronc + cardio sans impact',
    U: 'Vitesse + force complète',
  },
};

function libelle(phase: Phase, mod: Modele, variante: SeancePlanifiee['variante'], lieu: LieuSeance): string {
  if (mod.test?.type === 'journee1') return 'Tests de la journée 1';
  if (mod.test?.type === 'cooper') return 'Test demi-Cooper';
  let texte: string;
  if (mod.type === 'U' && phase !== 'affutage') {
    // Une seule séance : une semaine sur la piste, la suivante au gym (décision du 18 novembre 2026).
    texte = lieu === 'piste' ? (phase === 'fondation' ? 'Vitesse + course facile' : 'Vitesse') : 'Force complète';
  } else if (mod.type === 'C' && lieu === 'piste' && phase !== 'affutage') {
    texte = 'Course + pompes et gainage (version piste)';
  } else if (mod.deuxSeances && mod.type === 'B' && phase !== 'affutage') {
    texte = 'Pliométrie + force complète';
  } else if (mod.deuxSeances && mod.type === 'A' && phase !== 'affutage') {
    texte = phase === 'fondation' ? 'Vitesse + course facile' : phase === 'puissance-repetition' ? 'Vitesse maximale + sauts de patineur' : 'Vitesse';
  } else if (phase === 'puissance-repetition' && mod.type !== 'D' && mod.type !== 'U') {
    texte = {
      A: "Vitesse maximale + répétition d'efforts",
      B: 'Pliométrie + force et puissance du bas du corps',
      C: 'Force du haut du corps et tronc + vélo',
    }[mod.type];
  } else {
    const groupe = phase === 'fondation' ? 'fondation' : phase === 'affutage' ? 'affutage' : 'phases23';
    texte = LIBELLES[groupe][mod.type];
  }
  if (mod.test?.type === 'sprint') texte += ' + test de sprint';
  return variante === 'sans-course' ? `${texte} (sans course : vélo ou rameur)` : texte;
}

// ---------- Charge pour les jambes et course (section 3, « Placement des séances ») ----------

function chargeEtCourse(mod: Modele, variante: SeancePlanifiee['variante'], phase: Phase, lieu: LieuSeance): { charge: Charge; course: boolean } {
  if (mod.test?.type === 'journee1') return { charge: 'elevee', course: false }; // au gym, sans le sprint
  if (mod.test?.type === 'cooper') return { charge: 'elevee', course: true };
  switch (mod.type) {
    case 'A':
      return { charge: 'elevee', course: true }; // les sprints comptent comme de la course
    case 'U':
      return { charge: 'elevee', course: lieu === 'piste' };
    case 'B':
      return { charge: 'elevee', course: false };
    case 'C':
      // C avec course (course facile sur tapis, ou sur la piste) : charge moyenne. Sans course : faible.
      // Phase 3 au gym : haut du corps, tronc et vélo, sans course (ses efforts répétés sont passés sur la piste).
      if (variante === 'sans-course' || (phase === 'puissance-repetition' && lieu === 'gym')) return { charge: 'faible', course: false };
      return { charge: 'moyenne', course: true };
    case 'D':
      return { charge: 'faible', course: false };
  }
}

const peutEtreSansCourse = (mod: Modele, phase: Phase) => mod.type === 'C' && !mod.test && phase !== 'puissance-repetition';

/**
 * Lieux possibles d'une séance, le premier étant le lieu normal (section 2, corrigée le 18 novembre 2026) :
 * piste pour A et les tests de course, gym pour B, D et la journée 1, gym pour C (version piste possible),
 * et une semaine sur deux piste ou gym pour la séance unique.
 */
function lieuxPossibles(mod: Modele, phase: Phase, variante: SeancePlanifiee['variante'], numero: number): LieuSeance[] {
  if (mod.test?.type === 'journee1') return ['gym'];
  if (mod.test?.type === 'cooper' || mod.test?.type === 'sprint') return ['piste'];
  switch (mod.type) {
    case 'A':
      return ['piste'];
    case 'B':
    case 'D':
      return ['gym'];
    case 'U':
      if (phase === 'affutage') return ['piste', 'gym'];
      return numero % 2 === 1 ? ['piste', 'gym'] : ['gym', 'piste'];
    case 'C':
      if (variante === 'sans-course') return ['gym']; // vélo ou rameur
      if (phase === 'affutage') return ['piste']; // simulation de points
      return ['gym', 'piste'];
  }
}

// ---------- Placement ----------

interface Placement {
  mod: Modele;
  date: DateISO;
  variante: SeancePlanifiee['variante'];
  charge: Charge;
  course: boolean;
  lieu: LieuSeance;
  /** Le lieu n'est pas le lieu normal de la séance (C en version piste, séance unique hors alternance). */
  lieuDeRechange: boolean;
}

interface Contexte {
  phase: Phase;
  joursSemaine: DateISO[];
  /** Matchs et jours de tournoi, toutes semaines confondues. */
  joursMatch: Set<DateISO>;
  debutsTournoi: DateISO[];
  joursRecuperation: Set<DateISO>;
  joursAlleges: Set<DateISO>;
  dateSprint100?: DateISO;
  /** Séances des jours qui précèdent la semaine. */
  anterieures: SeancesPrecedentes;
  /** Lily a mis le lundi suivant dans ses jours disponibles : on évite alors de courir ou de se charger le dimanche. */
  lundiSuivantPrevu: boolean;
  numero: number;
  /** Lieu imposé par Lily pour certains jours. */
  lieux: Record<DateISO, LieuSeance>;
}

const POIDS_CHARGE: Record<Charge, number> = { elevee: 3, moyenne: 2, faible: 1 };

/** Règles de placement qui ne se négocient pas. Renvoie true si le placement est permis. */
function respecteLesRegles(placements: Placement[], ctx: Contexte, fixes: ReadonlySet<Placement> = new Set()): boolean {
  const parDate = new Map<DateISO, { charge: Charge; course: boolean }>(placements.map((p) => [p.date, p]));

  // Le dimanche précédent compte pour le lundi : pas 2 jours chargés ni 2 jours de course de suite.
  for (const a of ctx.anterieures) {
    const suivante = parDate.get(ajouterJours(a.date, 1));
    if (suivante && ((a.charge === 'elevee' && suivante.charge === 'elevee') || (a.course && suivante.course))) return false;
  }

  for (const p of placements) {
    const veille = ajouterJours(p.date, -1);
    const lendemain = ajouterJours(p.date, 1);
    const suivanteFixe = fixes.has(p) && fixes.has(parDate.get(lendemain) as Placement);
    if (fixes.has(p)) {
      // Séance déjà faite : seules ses relations avec les nouvelles séances comptent.
      const suivante = parDate.get(lendemain);
      if (suivante && !suivanteFixe) {
        if (p.charge === 'elevee' && suivante.charge === 'elevee') return false;
        if (p.course && suivante.course) return false;
      }
      continue;
    }
    const doitEtreFaible =
      ctx.joursMatch.has(p.date) || // séance le jour d'un match : charge faible seulement
      ctx.joursMatch.has(lendemain) || // veille de match
      ctx.joursMatch.has(veille) || // lendemain de match
      ctx.joursRecuperation.has(p.date) || // lundi et mardi après un tournoi
      ctx.debutsTournoi.some((t) => {
        const ecart = ecartJours(p.date, t);
        return ecart >= 1 && ecart <= 2; // rien de chargé pour les jambes dans les 48 h avant un tournoi
      });
    if (doitEtreFaible && p.charge !== 'faible') return false;

    const suivante = parDate.get(lendemain);
    if (suivante) {
      if (p.charge === 'elevee' && suivante.charge === 'elevee') return false; // jamais 2 jours chargés de suite
      if (p.course && suivante.course) return false; // jamais 2 jours de course de suite (tibias)
    }
  }

  // Au moins 1 jour complet de repos par semaine.
  const actifs = new Set([...placements.map((p) => p.date), ...ctx.joursSemaine.filter((j) => ctx.joursMatch.has(j))]);
  return actifs.size < ctx.joursSemaine.length || ctx.joursSemaine.length < 7;
}

/** Fatigue accumulée les 3 jours précédents (matchs et séances déjà placées). */
function fatigue(date: DateISO, placements: Placement[], ctx: Contexte): number {
  let total = 0;
  for (const [ecart, poids] of [
    [1, 1],
    [2, 0.5],
    [3, 0.25],
  ] as const) {
    const jour = ajouterJours(date, -ecart);
    if (ctx.joursMatch.has(jour)) total += POIDS_CHARGE.elevee * poids;
    const p = placements.find((x) => x.date === jour) ?? ctx.anterieures.find((x) => x.date === jour);
    if (p) total += POIDS_CHARGE[p.charge] * poids;
  }
  return total;
}

function distanceAuMatchLePlusProche(date: DateISO, ctx: Contexte): number {
  let min = 99;
  for (const m of ctx.joursMatch) min = Math.min(min, Math.abs(ecartJours(date, m)));
  return min;
}

/** Préférence pour le moment d'un test : 0 si respecté, 1 sinon. */
function ecartMomentTest(p: Placement, ctx: Contexte): number {
  const t = p.mod.test;
  if (!t) return 0;
  const rang = ctx.joursSemaine.indexOf(p.date);
  if (t.type === 'sprint') return ctx.dateSprint100 && p.date < ctx.dateSprint100 ? 1 : 0;
  if (t.moment === 'debut') return rang / 7;
  if (t.moment === 'fin') return (6 - rang) / 7;
  return 0;
}

/**
 * Note d'un placement valide : plus petit = meilleur. Comparée dans l'ordre :
 * 1. séances le jour d'un match (dernier recours) ;
 * 2. séances transformées (C sans course) ;
 * 3. séances sur des jours allégés d'une semaine normale (S6 : de préférence avant le 1er janvier) ;
 *    puis course le dimanche, puis séance chargée le dimanche (pour laisser le lundi suivant à A) ;
 * 4. moment prévu des tests (début ou fin de semaine, sprint à 100 % permis) ;
 * 5. pour chaque séance par ordre de priorité : fatigue des jours précédents
 *    (A sur le jour le plus frais), puis distance aux matchs (le plus loin possible) ;
 * 6. les jours les plus tôt, pour que le résultat soit toujours le même.
 */
function noter(placements: Placement[], ctx: Contexte): number[] {
  const note = [
    placements.filter((p) => ctx.joursMatch.has(p.date)).length,
    placements.filter((p) => p.variante === 'sans-course').length,
    // Lieu de rechange (C sur la piste, séance unique hors alternance) : seulement si les jours l'imposent.
    placements.filter((p) => p.lieuDeRechange).length,
    placements.filter((p) => ctx.joursAlleges.has(p.date)).length,
    // Éviter de finir la semaine par une course : la semaine suivante commence souvent par A (sprints).
    // Seulement quand Lily a prévu de s'entraîner le lundi suivant (décision du 18 novembre 2026).
    ctx.lundiSuivantPrevu ? placements.filter((p) => p.course && ctx.joursSemaine.length === 7 && p.date === ctx.joursSemaine[6]).length : 0,
    // Pareil pour une séance chargée : le lundi suivant pourra recevoir A (et la semaine d'un tournoi, c'est souvent le seul jour possible).
    ctx.lundiSuivantPrevu ? placements.filter((p) => p.charge === 'elevee' && ctx.joursSemaine.length === 7 && p.date === ctx.joursSemaine[6]).length : 0,
    // Le moment prévu des tests passe avant la fraîcheur de A (Cooper en début de S11, par exemple).
    placements.reduce((t, p) => t + ecartMomentTest(p, ctx), 0),
  ];
  for (const p of placements) {
    note.push(fatigue(p.date, placements, ctx), -distanceAuMatchLePlusProche(p.date, ctx));
  }
  for (const p of placements) note.push(ctx.joursSemaine.indexOf(p.date));
  return note;
}

function comparer(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (Math.abs(d) > 1e-9) return d;
  }
  return 0;
}

function meilleurPlacement(modeles: Modele[], jours: DateISO[], ctx: Contexte, fixes: Placement[] = []): Placement[] | null {
  let meilleur: { placements: Placement[]; note: number[] } | null = null;
  const ensembleFixes = new Set(fixes);

  const essayer = (i: number, libres: DateISO[], courant: Placement[]) => {
    if (i === modeles.length) {
      if (!respecteLesRegles([...fixes, ...courant], ctx, ensembleFixes)) return;
      const note = noter(courant, ctx);
      if (!meilleur || comparer(note, meilleur.note) < 0) meilleur = { placements: [...courant], note };
      return;
    }
    const mod = modeles[i]!;
    const variantes: SeancePlanifiee['variante'][] = peutEtreSansCourse(mod, ctx.phase) ? ['normale', 'sans-course'] : ['normale'];
    for (const date of libres) {
      for (const variante of variantes) {
        const lieux = lieuxPossibles(mod, ctx.phase, variante, ctx.numero);
        for (const lieu of lieux) {
          const impose = ctx.lieux[date];
          if (impose && impose !== lieu) continue;
          courant.push({ mod, date, variante, lieu, lieuDeRechange: lieu !== lieux[0], ...chargeEtCourse(mod, variante, ctx.phase, lieu) });
          essayer(
            i + 1,
            libres.filter((d) => d !== date),
            courant,
          );
          courant.pop();
        }
      }
    }
  };

  essayer(0, jours, []);
  return (meilleur as { placements: Placement[] } | null)?.placements ?? null;
}

/** Combinaisons de k séances parmi « base », dans l'ordre de priorité (A, B, C, D), tests toujours gardés. */
function compositions(semaine: Semaine, base: Modele[], k: number, joursPiste: boolean): Modele[][] {
  const liste: Modele[][] = [ajouterTests(composer(semaine.phase, k), semaine)];
  const tests = base.filter((m) => m.test);
  const parcourir = (debut: number, courant: Modele[]) => {
    if (courant.length === k) {
      if (tests.every((t) => courant.includes(t))) liste.push([...courant]);
      return;
    }
    for (let i = debut; i < base.length; i++) parcourir(i + 1, [...courant, base[i]!]);
  };
  parcourir(0, []);
  // Jours « piste seulement » : si B ne peut pas être placée, C (en version piste) la remplace plutôt que rien.
  for (const c of joursPiste ? [...liste] : []) {
    const i = c.findIndex((m) => m.type === 'B' && !m.test);
    if (i >= 0 && !c.some((m) => m.type === 'C')) liste.push(c.map((m, j) => (j === i ? { type: 'C' as const, deuxSeances: false } : m)));
  }
  // Dernier recours pour 1 séance : D (haut du corps, tronc, cardio sans impact), possible même quand
  // aucun jour ne permet une séance chargée pour les jambes (règle 7 : transformer plutôt que tout retirer).
  if (k === 1 && tests.length === 0) liste.push([{ type: 'D', deuxSeances: false }]);
  const vues = new Set<string>();
  return liste.filter((c) => {
    const cle = c.map((m) => `${m.type}${m.test?.type ?? ''}${m.deuxSeances ? '2' : ''}`).join(',');
    return vues.has(cle) ? false : (vues.add(cle), true);
  });
}

// ---------- Point d'entrée ----------

/**
 * Nom court d'une séance, pour Lily (les lettres A, B, C, D ne lui disent rien) :
 * « vitesse », « sauts et force », « intermittents »…
 */
export function nomCourt(phase: Phase, type: TypeSeance): string {
  switch (type) {
    case 'A':
      return 'vitesse';
    case 'U':
      return 'vitesse ou force';
    case 'B':
      return 'sauts et force';
    case 'D':
      return 'haut du corps et vélo';
    case 'C':
      return phase === 'puissance-repetition' ? 'haut du corps et tronc' : phase === 'affutage' ? 'simulation de points' : 'haut du corps et course';
  }
}

/** Icône d'une séance, d'après son type : vitesse ⚡, sauts 🦘, course ou intermittents 🏃, haut du corps 💪, tests 📋. */
export function iconeSeance(s: Pick<SeancePlanifiee, 'type' | 'test'> & Partial<Pick<SeancePlanifiee, 'lieu' | 'course'>>): string {
  if (s.test === 'journee1' || s.test === 'cooper') return '📋';
  if (s.type === 'U') return s.lieu === 'gym' ? '🏋️' : '⚡';
  if (s.type === 'C' && s.course === false) return '💪';
  return { A: '⚡', B: '🦘', C: '🏃', D: '💪' }[s.type];
}

/** Une séance de la composition par séance déjà faite (le même type, sinon la moins prioritaire). */
function retirerFaites(modeles: Modele[], faites: SeancePlanifiee[]): Modele[] {
  const reste = [...modeles];
  for (const f of faites) {
    let i = reste.findIndex((m) => m.type === f.type && m.test?.type === f.test);
    if (i < 0) i = reste.findIndex((m) => m.type === f.type);
    if (i < 0) i = reste.length - 1;
    if (i >= 0) reste.splice(i, 1);
  }
  return reste;
}

export function planifierSemaine(
  calendrier: Calendrier,
  numero: number,
  choix: ChoixSemaine,
  seancesPrecedentes: SeancesPrecedentes = [],
  /** Séances déjà faites ou commencées de cette semaine, quand elle est changée en cours de route. */
  seancesFaites: SeancePlanifiee[] = [],
  /** Le lundi suivant fait partie des jours disponibles de la semaine d'après. */
  lundiSuivantPrevu = false,
): PlanSemaine {
  const semaine = calendrier.semaines[numero - 1];
  if (!semaine) throw new Error(`Semaine ${numero} absente du programme.`);
  if (!Number.isInteger(choix.nbSeances) || choix.nbSeances < 1 || choix.nbSeances > 4) {
    throw new Error('Le nombre de séances doit être entre 1 et 4.');
  }

  const joursSemaine = joursEntre(semaine.debut, semaine.fin);
  const messages: string[] = [];

  // Matchs : réguliers et tournois de tout le calendrier, plus les matchs déclarés, moins les annulés.
  const annules = new Set(choix.matchsAnnules ?? []);
  const evenementsMatch = calendrier.semaines
    .flatMap((s) => s.evenements)
    .filter((e) => (e.type === 'match' || e.type === 'tournoi') && !annules.has(e.date));
  for (const date of choix.matchsSupplementaires ?? []) {
    if (!evenementsMatch.some((e) => e.date === date)) evenementsMatch.push({ date, type: 'match', nom: 'Match' });
  }
  const joursMatch = new Set(evenementsMatch.map((e) => e.date));
  const matchs = evenementsMatch.filter((e) => joursSemaine.includes(e.date)).sort((a, b) => (a.date < b.date ? -1 : 1));

  const ctx: Contexte = {
    phase: semaine.phase,
    joursSemaine,
    joursMatch,
    // Rien de chargé pour les jambes dans les 48 h avant un tournoi ou avant le début de la saison (section 2, « Affûtage »).
    debutsTournoi: [...calendrier.config.tournois.map((t) => t.debut), calendrier.config.echeance],
    joursRecuperation: new Set(semaine.joursRecuperation),
    // Jours allégés d'une semaine qui n'est pas entièrement allégée (S6) : à éviter si possible.
    joursAlleges: new Set(semaine.legere?.etendue === 'complete' ? [] : semaine.joursAlleges),
    dateSprint100: calendrier.config.restrictions.sprint
      ? ajouterJours(calendrier.config.restrictions.sprint.jusquau, 1)
      : undefined,
    anterieures: seancesPrecedentes.filter((s) => s.date < semaine.debut && ecartJours(s.date, semaine.debut) <= 3),
    lundiSuivantPrevu,
    numero,
    lieux: choix.lieux ?? {},
  };

  const faites = seancesFaites.filter((f) => joursSemaine.includes(f.date));
  const datesFaites = new Set(faites.map((f) => f.date));
  const jours = [...new Set(choix.joursDisponibles)]
    .filter((j) => joursSemaine.includes(j) && j >= (choix.depuis ?? '') && !datesFaites.has(j))
    .sort();
  if (choix.depuis && faites.length) messages.push('Semaine recalculée : les séances déjà faites restent, les autres sont replacées sur les jours qui restent.');

  // Plafonds de la semaine.
  let n = choix.nbSeances;
  const semaineAllegee = joursSemaine.every((j) => semaine.joursAlleges.includes(j));
  if (semaine.tournoi && n > 2) {
    n = 2;
    messages.push('Semaine de tournoi : 2 séances au plus, en version courte et sans record.');
  }
  if (semaineAllegee && n > 2) {
    n = 2;
    messages.push("Période allégée : 2 séances d'environ 1 h, avec les charges gardées.");
  }
  n = Math.max(n, faites.length);
  if (jours.length < n - faites.length) {
    messages.push(
      jours.length === 0 && faites.length === 0
        ? "Aucun jour disponible cette semaine : pas de séance. Les routines de prévention à la maison restent possibles."
        : faites.length
          ? `Il reste ${jours.length} jour${jours.length > 1 ? 's' : ''} disponible${jours.length > 1 ? 's' : ''} : l'app prévoit ${faites.length + jours.length} séance${faites.length + jours.length > 1 ? 's' : ''} en tout.`
          : `Tu as donné ${jours.length} jour${jours.length > 1 ? 's' : ''} pour ${n} séances : l'app prévoit ${jours.length} séance${jours.length > 1 ? 's' : ''}.`,
    );
    n = faites.length + jours.length;
  }

  // On essaie avec n séances, puis une de moins tant qu'aucun placement ne respecte les règles.
  // Pour chaque nombre de séances, on essaie d'abord la composition habituelle (section 2), puis les autres
  // combinaisons des séances choisies par Lily, dans l'ordre de priorité de la section 4. Ainsi, quand A et B
  // ne peuvent pas être placées (semaine de tournoi, fin d'affûtage), C sans course ou D peuvent l'être.
  // Séances déjà faites : elles restent à leur place et comptent dans les règles. Leurs tests sont faits.
  const fixes: Placement[] = faites.map((f) => ({
    mod: { type: f.type, deuxSeances: f.deuxSeances, test: f.test ? { type: f.test, moment: 'semaine', semaine: numero } : undefined },
    date: f.date,
    variante: f.variante,
    charge: f.charge,
    course: f.course,
    lieu: f.lieu ?? (f.course ? 'piste' : 'gym'),
    lieuDeRechange: false,
  }));
  const semaineRestante: Semaine = { ...semaine, retests: semaine.retests.filter((r) => !faites.some((f) => f.test === r.type)) };

  let placements: Placement[] = [];
  const nDemande = n;
  let base = ajouterTests(composer(semaine.phase, Math.min(choix.nbSeances, jours.length + faites.length)), semaineRestante);
  if (semaine.phase === 'affutage' && semaine.tournoi) base = base.filter((m) => m.type !== 'C'); // C retirée la semaine d'un tournoi
  let trouve = false;
  for (let k = n; k >= Math.max(1, faites.length) && !trouve; k--) {
    for (const modeles of compositions(semaineRestante, base, k, Object.values(ctx.lieux).includes('piste'))) {
      const reste = retirerFaites(modeles, faites);
      if (reste.length === 0) {
        trouve = true;
        break;
      }
      const nouvelles = meilleurPlacement(reste, jours, ctx, fixes);
      if (nouvelles) {
        placements = nouvelles;
        trouve = true;
        break;
      }
    }
  }
  placements = [...fixes, ...placements];
  const attendues = ajouterTests(composer(semaine.phase, nDemande), semaine).map((m) => m.type);
  const gardees = new Set(placements.map((p) => p.mod.type));
  const nom = (t: TypeSeance) => `« ${nomCourt(semaine.phase, t)} »`;
  const remplacantes = [...gardees].filter((t) => !attendues.includes(t) && t !== 'U').map(nom);
  const retirees = attendues
    .filter((t) => !gardees.has(t) && !(t === 'A' && gardees.has('U')) && !(t === 'B' && gardees.has('U')))
    .map(nom);
  const aLaPlace = remplacantes.length
    ? ` ${remplacantes.length > 1 ? `Les séances ${remplacantes.join(' et ')} les remplacent` : `La séance ${remplacantes[0]} ${retirees.length > 1 ? 'les' : 'la'} remplace`} (moins de charge pour les jambes).`
    : '';
  if (nDemande > 0 && placements.length < nDemande) {
    const liste = gardees.has('U')
      ? `une seule séance, ${placements.find((x) => x.mod.type === 'U')?.lieu === 'piste' ? 'sur la piste' : 'au gym'}`
      : retirees.length > 1
        ? `les séances ${retirees.slice(0, -1).join(', ')} et ${retirees.at(-1)} sont retirées`
        : `la séance ${retirees[0]} est retirée`;
    messages.push(
      placements.length === 0
        ? 'Aucune séance ne peut être placée sur ces jours en respectant les règles (matchs, repos, tibias). Ajoute un jour si tu peux.'
        : `Les jours choisis ne permettent que ${placements.length} séance${placements.length > 1 ? 's' : ''} en respectant les règles (matchs, repos, tibias) : ${liste} cette semaine.${aLaPlace}`,
    );
    if (semaine.retests.some((r) => r.type === 'cooper' && r.moment !== 'condition') && gardees.has('C') && !gardees.has('B') && nDemande >= 3) {
      messages.push(`Le test demi-Cooper est gardé : il prend la place de la séance ${nom('B')}.`);
    }
  } else if (retirees.length > 0 && remplacantes.length > 0) {
    messages.push(
      `Les jours choisis ne permettent pas ${retirees.length > 1 ? `les séances ${retirees.join(' et ')}` : `la séance ${retirees[0]}`} en respectant les règles (matchs, repos, tibias).${aLaPlace}`,
    );
  }

  const seances: SeancePlanifiee[] = placements
    .map((p) => faites.find((f) => f.date === p.date && fixes.includes(p)) ?? ({
      date: p.date,
      type: p.mod.type,
      libelle: libelle(semaine.phase, p.mod, p.variante, p.lieu),
      variante: p.variante,
      deuxSeances: p.mod.deuxSeances,
      test: p.mod.test?.type,
      charge: p.charge,
      course: p.course,
      // Durée maximale choisie à la création (1 h 30 pour 2026-2027) ; environ 1 h en période allégée.
      dureeMax: Math.min(semaineAllegee || ctx.joursAlleges.has(p.date) ? 60 : 90, calendrier.config.disponibilites?.dureeMax ?? 90),
      courte: semaine.tournoi,
      lieu: p.lieu,
      ...(!p.mod.test && (choix.express ?? []).includes(p.date) ? { express: true } : {}),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const s of seances.filter((x) => !datesFaites.has(x.date))) {
    const p = placements.find((x) => x.date === s.date);
    if (p?.lieuDeRechange && s.type === 'C') {
      messages.push(`Séance ${nom(s.type)} en version piste (course, pompes et gainage) : ${ctx.lieux[s.date] === 'piste' ? 'tu as indiqué la piste ce jour-là' : 'les jours choisis le demandent'}.`);
    } else if (p?.lieuDeRechange && s.type === 'U') {
      messages.push(`Séance ${s.lieu === 'piste' ? 'sur la piste' : 'au gym'} cette semaine : ${ctx.lieux[s.date] ? 'c\'est le lieu indiqué pour ce jour-là' : 'les jours choisis le demandent'}.`);
    }
    if (ctx.joursMatch.has(s.date)) {
      messages.push(`Séance ${nom(s.type)} le jour du match : seulement du haut du corps et du tronc, sans course ni sauts.`);
    } else if (s.variante === 'sans-course') {
      const quoi = (d: DateISO) => (calendrier.config.tournois.some((t) => d >= t.debut && d <= t.fin) ? 'du tournoi' : 'du match');
      const veille = ajouterJours(s.date, -1);
      const lendemain = ajouterJours(s.date, 1);
      const pres = ctx.joursMatch.has(veille)
        ? `le lendemain ${quoi(veille)}`
        : ctx.joursMatch.has(lendemain)
          ? `la veille ${quoi(lendemain)}`
          : ctx.joursRecuperation.has(s.date)
            ? 'pendant la récupération après le tournoi'
            : 'à cause des jours choisis';
      messages.push(`Séance ${nom(s.type)} en version sans course (vélo ou rameur) : elle tombe ${pres}.`);
    }
    if (s.test === 'sprint' && ctx.dateSprint100 && s.date < ctx.dateSprint100) {
      messages.push('Le test de sprint attend la première séance de vitesse à partir du jour où le sprint à 100 % est permis.');
    }
  }

  return { numero, seances, matchs, messages };
}
