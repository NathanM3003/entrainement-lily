import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { calculerSaison } from '../stockage/saison';
import { DONNEES_VIDES, type Donnees, type ResultatExercice, type ResultatSeance } from '../stockage/types';
import { genererCalendrier } from './calendrier';
import type { Prescription, SeanceDetaillee } from './contenu';
import { joursEntre } from './dates';
import { chargePrevue, chargeRetenue, estimation1RM, maximumEstime, suiviDouleurs } from './progression';

const cal = genererCalendrier(SAISON_2026_2027);
const jours = (n: number) => joursEntre(cal.semaines[n - 1]!.debut, cal.semaines[n - 1]!.fin);

function donnees(semaines = [1, 2, 3, 4, 5, 6], nb = 3): Donnees {
  const d = structuredClone(DONNEES_VIDES);
  for (const n of semaines) d.choix[n] = { nbSeances: nb, joursDisponibles: jours(n) };
  return d;
}

const seanceDe = (d: Donnees, n: number, type: string, aujourdhui = '2026-11-20') =>
  calculerSaison(cal, d, aujourdhui)[n - 1]!.seances.find((x) => x.seance.type === type && !x.seance.test)?.seance ??
  calculerSaison(cal, d, aujourdhui)[n - 1]!.seances.find((x) => x.seance.type === type)!.seance;

/** Termine la séance prévue avec les résultats donnés. */
function faire(d: Donnees, n: number, type: string, exercices: Record<string, ResultatExercice>, extra: Partial<ResultatSeance> = {}): SeanceDetaillee {
  const s = seanceDe(d, n, type);
  d.resultats[s.date] = { date: s.date, semaine: n, seance: s, exercices, terminee: true, modifieLe: s.date, effort: 6, ...extra };
  return s;
}

const prescription = (s: SeanceDetaillee, id: string, bloc = 'force') => s.contenu.blocs.find((b) => b.type === bloc)!.exercices.find((p) => p.id === id)!;
const series = (n: number, reps: number, charge: number, derniere = reps) =>
  Array.from({ length: n }, (_, i) => ({ reps: i === n - 1 ? derniere : reps, charge }));

/** Tests de la journée 1 en S1 : 50 kg au squat (1RM estimé 60 kg). */
function avecTests(d: Donnees) {
  faire(d, 1, 'A', {
    'tests:T-F1': { mesure: { valeur: 50 }, unite: 'kg' },
    'tests:T-F7': { mesure: { gauche: 16, droite: 18 }, unite: 'kg' },
    'tests:T-F14': { mesure: { valeur: 10 }, unite: 'kg' },
    'tests:T-F16': { mesure: { valeur: 40 }, unite: 'kg' },
  });
}

describe('maximum estimé (section 7)', () => {
  it('formule : charge × (1 + (répétitions + réserve) ÷ 30) ; test à 5 répétitions, 1 en réserve = charge × 1,2', () => {
    expect(estimation1RM(50, 5, 1)).toBeCloseTo(60);
    const d = donnees();
    avecTests(d);
    expect(maximumEstime(cal, d, 'F1', '2026-12-01')).toBeCloseTo(60);
    // Squat bulgare : le côté le plus faible.
    expect(maximumEstime(cal, d, 'F7', '2026-12-01')).toBeCloseTo(19.2);
  });

  it('se met à jour avec la dernière série « + »', () => {
    const d = donnees();
    avecTests(d);
    faire(d, 1, 'B', { 'force:F1': { series: series(3, 8, 40, 12), unite: 'kg' } });
    // 40 × (1 + (12 + 2) ÷ 30) en Fondation (2 répétitions en réserve).
    expect(maximumEstime(cal, d, 'F1', '2026-12-01')).toBeCloseTo(40 * (1 + 14 / 30));
  });
});

describe('charge prévue', () => {
  it('première séance de la phase : % du maximum estimé, −5 %, arrondi au cran du dessous', () => {
    const d = donnees();
    avecTests(d);
    const b = seanceDe(d, 1, 'B');
    const f1 = prescription(b, 'F1');
    expect(f1.moinsCinqPourcent).toBe(true);
    // 60 × 70 % × 0,95 = 39,9 → 37,5 kg (barre : 2,5 kg).
    expect(chargePrevue(cal, d, b.date, 'fondation', f1)).toMatchObject({ charge: 37.5, unite: 'kg' });
    // Squat bulgare (haltères, 2 kg) : 19,2 × 0,7 × 0,95 = 12,8 → 12 kg.
    expect(chargePrevue(cal, d, b.date, 'fondation', prescription(b, 'F7'))?.charge).toBe(12);
  });

  it('sans test ni séance d’avant : charge à trouver', () => {
    const d = donnees();
    const b = seanceDe(d, 1, 'B');
    expect(chargePrevue(cal, d, b.date, 'fondation', prescription(b, 'F1'))).toBeUndefined();
    expect(chargePrevue(cal, d, b.date, 'fondation', prescription(b, 'F10'))).toBeUndefined();
  });

  const apresB1 = (f1: ResultatExercice, extra: Partial<ResultatSeance> = {}) => {
    const d = donnees();
    avecTests(d);
    faire(d, 1, 'B', { 'force:F1': f1 }, extra);
    const b2 = seanceDe(d, 2, 'B');
    return chargePrevue(cal, d, b2.date, 'fondation', prescription(b2, 'F1'));
  };

  it('dernière série : 1 à 3 de plus → +1 cran ; exactement le prévu → même charge', () => {
    expect(apresB1({ series: series(3, 8, 40, 10), unite: 'kg' })).toMatchObject({ charge: 42.5 });
    expect(apresB1({ series: series(3, 8, 40), unite: 'kg' })).toMatchObject({ charge: 40 });
  });

  it('4 de plus → +2 crans, sauf si ça dépasse 10 % de hausse', () => {
    expect(apresB1({ series: series(3, 8, 60, 12), unite: 'kg' })?.charge).toBe(65);
    // 40 kg + 5 kg = 12,5 % : on se limite à +1 cran.
    expect(apresB1({ series: series(3, 8, 40, 12), unite: 'kg' })?.charge).toBe(42.5);
  });

  it('une charge plus lourde que prévu devient la nouvelle base', () => {
    expect(apresB1({ series: series(3, 8, 45), unite: 'kg', prevu: { reps: 8, charge: 40 } })?.charge).toBe(45);
  });

  it('répétitions manquées : même charge, puis −1 cran si ça se répète', () => {
    expect(apresB1({ series: [{ reps: 8, charge: 40 }, { reps: 6, charge: 40 }, { reps: 6, charge: 40 }], unite: 'kg' })?.charge).toBe(40);
    const d = donnees();
    avecTests(d);
    const manque = { series: [{ reps: 8, charge: 40 }, { reps: 6, charge: 40 }, { reps: 6, charge: 40 }], unite: 'kg' as const };
    faire(d, 1, 'B', { 'force:F1': manque });
    faire(d, 2, 'B', { 'force:F1': manque });
    const b3 = seanceDe(d, 3, 'B');
    expect(chargePrevue(cal, d, b3.date, 'fondation', prescription(b3, 'F1'))?.charge).toBe(37.5);
  });

  it('effort de 9 ou plus : pas de hausse à la séance suivante', () => {
    expect(apresB1({ series: series(3, 8, 40, 11), unite: 'kg' }, { effort: 9 })).toMatchObject({ charge: 40 });
  });

  it('haltères : si le poids suivant fait plus de 10 % de hausse, on ajoute d’abord des répétitions', () => {
    const d = donnees();
    faire(d, 1, 'C', { 'force:F14': { series: series(3, 8, 10, 10), unite: 'kg' } });
    const c2 = seanceDe(d, 2, 'C');
    expect(chargePrevue(cal, d, c2.date, 'fondation', prescription(c2, 'F14'))).toMatchObject({ charge: 10, reps: 9 });
  });

  it('puissance (F25) : +1 cran quand toutes les répétitions sont faites deux séances de suite', () => {
    const d = donnees([11]);
    const a = seanceDe(d, 11, 'B');
    const fois = (date: string, reps: number) =>
      (d.resultats[date] = {
        date,
        semaine: 11,
        seance: { ...a, date },
        exercices: { 'force:F25': { series: series(4, reps, 6), unite: 'kg', prevu: { reps } } },
        terminee: true,
        modifieLe: date,
      });
    const f25 = prescription(a, 'F25');
    fois('2027-02-01', 4);
    expect(chargePrevue(cal, d, '2027-02-04', 'puissance-repetition', f25)).toMatchObject({ charge: 6, reps: undefined });
    fois('2027-02-04', 4);
    // 6 → 8 kg ferait +33 % : d'abord une répétition de plus.
    expect(chargePrevue(cal, d, '2027-02-07', 'puissance-repetition', f25)).toMatchObject({ charge: 6, reps: 5 });
    fois('2027-02-07', 5);
    fois('2027-02-10', 5);
    // Haut de la fourchette (5) atteint deux fois : poids suivant.
    expect(chargePrevue(cal, d, '2027-02-13', 'puissance-repetition', f25)).toMatchObject({ charge: 8 });
  });

  it('en livres : conversion et cran de 5 lb', () => {
    const d = donnees();
    avecTests(d);
    d.preferences.unites.F1 = 'lb';
    const b = seanceDe(d, 1, 'B');
    // 39,9 kg = 88 lb → 85 lb.
    expect(chargePrevue(cal, d, b.date, 'fondation', prescription(b, 'F1'))).toMatchObject({ charge: 85, unite: 'lb' });
  });

  it('retour après 10 jours ou plus sans entraînement : −15 %', () => {
    const d = donnees();
    faire(d, 1, 'B', { 'force:F1': { series: series(3, 8, 40), unite: 'kg' } });
    const b3 = seanceDe(d, 3, 'B');
    // 40 × 0,85 = 34 → 32,5 kg (cran du dessous).
    expect(chargePrevue(cal, d, b3.date, 'fondation', prescription(b3, 'F1'))).toMatchObject({ charge: 32.5 });
  });

  it('affûtage : la dernière charge lourde utilisée', () => {
    const d = donnees([13, 14, 15, 16]);
    faire(d, 13, 'B', { 'force:F7': { series: series(3, 5, 22), unite: 'kg' } });
    const p = { id: 'F7', role: 'force-bas', series: 2, reps: { min: 5, max: 5 } } as Prescription;
    // S14 est une semaine de tests (journée 1 à la place de B) : la dernière charge lourde vient de S13.
    expect(chargePrevue(cal, d, '2027-03-01', 'affutage', p)).toMatchObject({ charge: 22, explication: 'Ta dernière charge lourde.' });
  });
});

describe('course facile, sprints et sauts d’une semaine à l’autre', () => {
  const etape = (d: Donnees, n: number) => calculerSaison(cal, d, '2026-11-20')[n - 1]!.progression.etapeCourse;

  it('une étape de plus par semaine quand toutes les courses sont faites sans douleur', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleurs: { tibias: 1, genou: 0 } });
    expect(etape(d, 2)).toBe(2);
    const c2 = seanceDe(d, 2, 'C');
    expect(c2.contenu.blocs.find((b) => b.type === 'course')!.exercices[0]!.format).toMatch(/^Étape 2/);
  });

  it('douleur de 3 ou 4 : même étape ; course pas faite : même étape', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleurs: { tibias: 3 } });
    expect(etape(d, 2)).toBe(1);
    const e = donnees();
    faire(e, 1, 'C', { 'course:E1': { pasFait: { raison: 'temps' } } });
    expect(etape(e, 2)).toBe(1);
  });

  it('douleur de 5 ou plus (tibias ou genou) : la course recule et la suivante passe sur vélo ou rameur', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleurs: { tibias: 0 } });
    faire(d, 2, 'A', {}, { douleurs: { genou: 5 } });
    expect(suiviDouleurs(d).courseEnCardioApres).toBe(seanceDe(d, 2, 'A').date);
    const c2 = seanceDe(d, 2, 'C');
    expect(c2.contenu.blocs.some((b) => b.type === 'course')).toBe(false);
    expect(c2.contenu.blocs.flatMap((b) => b.exercices).some((p) => p.remplaceCourse)).toBe(true);
    expect(etape(d, 3)).toBe(1);
  });

  it('douleur le lendemain matin : même effet', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleursLendemain: { tibias: 4 } });
    expect(suiviDouleurs(d).courseEnCardioApres).toBeDefined();
  });

  it('pas de progression en semaine légère', () => {
    // 2 séances par semaine : en S1, la séance A est remplacée par les tests (pas de course).
    const d = donnees([1, 2, 3, 4, 5, 6], 2);
    for (const n of [1, 2, 3, 4]) faire(d, n, 'A', {});
    expect(etape(d, 5)).toBe(4);
    faire(d, 5, 'A', {});
    expect(etape(d, 6)).toBe(4);
  });

  it('sprints : +1 la semaine suivante quand la séance de vitesse est faite en entier, sans tension', () => {
    const d = donnees();
    const a2 = seanceDe(d, 2, 'A');
    const acc = a2.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.find((p) => p.role === 'acceleration');
    // S2 : test de sprint à la place des accélérations ; on regarde S3 puis S4.
    expect(acc).toBeUndefined();
    const a3 = seanceDe(d, 3, 'A');
    const acc3 = a3.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.find((p) => p.role === 'acceleration')!;
    expect(acc3.reps).toEqual({ min: 4, max: 8 });
    faire(d, 3, 'A', { [`vitesse:${acc3.id}`]: { nombre: 4 } });
    const acc4 = seanceDe(d, 4, 'A').contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.find((p) => p.role === 'acceleration')!;
    expect(acc4.reps?.min).toBe(5);
  });

  it('tension derrière la cuisse : 1 semaine sans V3 ni vitesse maximale', () => {
    const d = donnees([6, 7, 8]);
    const a6 = seanceDe(d, 6, 'A', '2026-12-20');
    const max = a6.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.find((p) => p.role === 'vitesse-max')!;
    faire(d, 6, 'A', { [`vitesse:${max.id}`]: { nombre: 1, tension: true } });
    const a7 = seanceDe(d, 7, 'A', '2026-12-20');
    const ids = a7.contenu.blocs.flatMap((b) => b.exercices.map((p) => p.id));
    expect(ids.some((id) => id === 'V3' || id === 'V9' || id === 'V11')).toBe(false);
    expect(a7.contenu.messages.some((m) => m.startsWith('Tension récente'))).toBe(true);
  });

  it('chevilles à 5 ou plus : la pliométrie revient au niveau précédent', () => {
    const d = donnees();
    faire(d, 1, 'B', {}, { douleurs: { chevilles: 6 } });
    const b2 = seanceDe(d, 2, 'B');
    const plio = b2.contenu.blocs.find((b) => b.type === 'pliometrie')!.exercices.filter((p) => p.role === 'plio').map((p) => p.id);
    expect(plio.every((id) => id === 'P1' || id === 'P3')).toBe(true);
  });

  it('niveau suivant après 2 séances complètes au niveau atteint, sans douleur aux chevilles', () => {
    const d = donnees();
    // S1 : seulement P1 (niveau 1), qui ne compte pas pour passer au niveau 3.
    faire(d, 1, 'B', {}, { douleurs: { chevilles: 1 } });
    faire(d, 2, 'B', {}, { douleurs: { chevilles: 1 } });
    expect(calculerSaison(cal, d, '2026-11-20')[2]!.progression.niveauPlio).toBe(2);
    faire(d, 3, 'B', {}, { douleurs: { chevilles: 0 } });
    faire(d, 4, 'B', {}, { douleurs: { chevilles: 2 } });
    expect(calculerSaison(cal, d, '2026-11-20')[4]!.progression.niveauPlio).toBe(3);
  });

  it('douleur de 5 ou plus pendant plus d’une semaine : pause et conseil de voir la physio', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleurs: { tibias: 6 } });
    expect(suiviDouleurs(d).alertes).toEqual([]);
    faire(d, 2, 'C', {}, { douleurs: { tibias: 5 } });
    const suivi = suiviDouleurs(d);
    expect(suivi.pauseCourse).toBe(true);
    expect(suivi.alertes[0]).toMatch(/Va voir la physio/);
  });
});

describe('décisions de Lily (18 novembre 2026)', () => {
  const cal2 = genererCalendrier(SAISON_2026_2027);
  it('une course manquée n’arrête pas la progression : une course faite sans douleur suffit', () => {
    const d = donnees();
    faire(d, 1, 'C', {}, { douleurs: { tibias: 0 } });
    // S2 : seule la séance A est faite, la séance C (avec course) est manquée.
    faire(d, 2, 'A', {}, { douleurs: { tibias: 1 } });
    expect(calculerSaison(cal2, d, '2026-11-20')[2]!.progression.etapeCourse).toBe(3);
  });
});

describe('garde-fou contre les fautes de frappe (22 novembre 2026)', () => {
  it('une charge loin du prévu ne compte que si Lily la confirme', () => {
    const r: ResultatExercice = { unite: 'kg', prevu: { charge: 40 } };
    expect(chargeRetenue(r, 45)).toBe(true);
    expect(chargeRetenue(r, 400)).toBe(false);
    expect(chargeRetenue(r, 4)).toBe(false);
    expect(chargeRetenue({ ...r, chargesVerifiees: [400] }, 400)).toBe(true);
    // Sans charge prévue (tests) : plus de 150 kg est douteux.
    expect(chargeRetenue({ unite: 'kg' }, 120)).toBe(true);
    expect(chargeRetenue({ unite: 'kg' }, 500)).toBe(false);
    expect(chargeRetenue({ unite: 'lb' }, 300)).toBe(true);
  });

  it('une faute de frappe non confirmée ne fait pas monter la charge suivante', () => {
    const d = donnees();
    avecTests(d);
    faire(d, 1, 'B', { 'force:F1': { series: [{ reps: 8, charge: 40 }, { reps: 8, charge: 40 }, { reps: 8, charge: 400 }], unite: 'kg', prevu: { reps: 8, charge: 40 } } });
    const b2 = seanceDe(d, 2, 'B');
    expect(chargePrevue(cal, d, b2.date, 'fondation', prescription(b2, 'F1'))?.charge).toBe(40);
  });

  it('un test de la journée 1 tapé avec un zéro de trop est ignoré', () => {
    const d = donnees();
    faire(d, 1, 'A', { 'tests:T-F1': { mesure: { valeur: 500 }, unite: 'kg' } });
    expect(maximumEstime(cal, d, 'F1', '2026-12-01')).toBeUndefined();
  });
});
