import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { calculerSaison } from '../stockage/saison';
import { texteVitesse, distanceEffort } from '../stockage/saisie';
import { DONNEES_VIDES, type Donnees, type ResultatExercice, type ResultatSeance } from '../stockage/types';
import { genererCalendrier } from './calendrier';
import { detaillerSemaine, type SeanceDetaillee } from './contenu';
import { joursEntre } from './dates';
import { allures, conditionCooper, intermittentsEnPlus, semainesLegeresAnticipees, seriesEnPlus } from './progression';
import { planifierSemaine } from './semaine';

const cal = genererCalendrier(SAISON_2026_2027);
const jours = (n: number) => joursEntre(cal.semaines[n - 1]!.debut, cal.semaines[n - 1]!.fin);

function donnees(semaines: number[], nb = 3): Donnees {
  const d = structuredClone(DONNEES_VIDES);
  for (const n of semaines) d.choix[n] = { nbSeances: nb, joursDisponibles: jours(n) };
  return d;
}
const saison = (d: Donnees, aujourdhui = '2026-11-20') => calculerSaison(cal, d, aujourdhui);
const seanceDe = (d: Donnees, n: number, type: string, aujourdhui?: string) => saison(d, aujourdhui)[n - 1]!.seances.find((x) => x.seance.type === type)!.seance;
const ids = (s: SeanceDetaillee) => s.contenu.blocs.flatMap((b) => b.exercices.map((p) => p.id));

function enregistrer(d: Donnees, n: number, s: SeanceDetaillee, exercices: Record<string, ResultatExercice> = {}, extra: Partial<ResultatSeance> = {}) {
  d.resultats[s.date] = { date: s.date, semaine: n, seance: s, exercices, terminee: true, modifieLe: s.date, effort: 6, ...extra };
}

const cooper = (tours: number, reste: number) => ({ 'tests:T-cooper': { cooper: { tours, reste } } });

describe('test demi-Cooper et allures (sections 5 et 7)', () => {
  it('VMA = distance du demi-Cooper ÷ 100, puis ±0,5 km/h selon les intermittents', () => {
    const d = donnees([11, 12, 13, 14]);
    const c11 = seanceDe(d, 11, 'C');
    enregistrer(d, 11, c11, cooper(2, 320)); // 1 240 m en 6 min
    expect(allures(d)).toMatchObject({ vma: 12.4, ajustement: 0 });
    const c14 = seanceDe(d, 14, 'A'); // les intermittents se font sur la piste
    const format = c14.contenu.blocs.find((b) => b.type === 'intermittents')!.exercices[0]!;
    expect(format.id).not.toBe('E10');
    const fois = (date: string, r: ResultatExercice) => enregistrer(d, 14, { ...c14, date }, { [`intermittents:${format.id}`]: r });
    fois('2027-02-22', { rythme: 'plus-vite' });
    expect(allures(d).ajustement).toBe(0);
    fois('2027-02-24', { rythme: 'plus-vite' });
    expect(allures(d)).toMatchObject({ vma: 12.9, ajustement: 0.5 });
    fois('2027-02-26', { rythme: 'plus-lent' });
    expect(allures(d).ajustement).toBe(0);
  });

  it('les intermittents affichent leur vitesse et la distance sur la piste', () => {
    const plan = planifierSemaine(cal, 8, { nbSeances: 4, joursDisponibles: jours(8) });
    const c = detaillerSemaine(cal, plan, { vma: 12 }).seances.find((s) => s.type === 'A')!;
    const inter = c.contenu.blocs.find((b) => b.type === 'intermittents')!.exercices[0]!;
    const pct = inter.pctVMA!.min;
    expect(inter.vitesseKmh?.min).toBeCloseTo((12 * pct) / 100);
    expect(texteVitesse({ min: 12, max: 12 }, 'min/km')).toBe('5:00 min/km');
    expect(texteVitesse({ min: 12, max: 12.6 }, 'km/h')).toBe('12 à 12,6 km/h');
    expect(distanceEffort(12.6, 15)).toBe(55);
  });

  it('un format d’intermittents réussi revient avec 1 répétition de plus par série', () => {
    const d = donnees([6, 7, 8]);
    const c6 = seanceDe(d, 8, 'A');
    const format = c6.contenu.blocs.find((b) => b.type === 'intermittents')!.exercices[0]!;
    enregistrer(d, 8, c6, { [`intermittents:${format.id}`]: { nombre: 100 } });
    expect(intermittentsEnPlus(cal, d, '2027-03-01')).toEqual({ [format.id]: 1 });
  });

  it('proposé dès que Lily a couru 20 min en continu deux fois sans douleur, entre S4 et S6', () => {
    const d = donnees([1, 2, 3, 4]);
    const c = seanceDe(d, 2, 'C');
    const vingt = {
      ...c,
      contenu: {
        ...c.contenu,
        blocs: c.contenu.blocs.map((b) => (b.type === 'course' ? { ...b, exercices: b.exercices.map((p) => ({ ...p, format: 'Étape 5 : 20 min en continu' })) } : b)),
      },
    };
    enregistrer(d, 2, { ...vingt, date: '2026-12-03' }, {}, { douleurs: { tibias: 1, genou: 0 } });
    expect(conditionCooper(d, '2026-12-14')).toBe(false);
    enregistrer(d, 3, { ...vingt, date: '2026-12-10' }, {}, { douleurs: { tibias: 0, genou: 0 } });
    expect(conditionCooper(d, '2026-12-14')).toBe(true);
    const s4 = saison(d)[3]!;
    expect(s4.seances.some((s) => s.seance.test === 'cooper')).toBe(true);
    expect(s4.messages).toContain('Test demi-Cooper proposé cette semaine : tu as couru 20 min en continu deux fois sans douleur.');
  });
});

describe('retests (section 6)', () => {
  it('S5 : mini-retest dans la séance B, à la place des sauts et de M1', () => {
    const d = donnees([5], 2);
    const b = seanceDe(d, 5, 'B');
    expect(ids(b)).toEqual(expect.arrayContaining(['T-cheville', 'T-saut', 'T-mollet']));
    expect(b.contenu.blocs.find((x) => x.type === 'pliometrie')?.exercices.some((p) => p.role === 'plio') ?? false).toBe(false);
    expect(b.contenu.blocs.find((x) => x.type === 'prevention')!.exercices.map((p) => p.id)).not.toContain('M1');
  });

  it('un test manqué est reporté à la semaine suivante', () => {
    const d = donnees([1, 2]);
    const s2 = saison(d, '2026-11-30')[1]!;
    expect(s2.semaine.retests.map((r) => r.type)).toEqual(['sprint', 'journee1']);
    expect(s2.messages).toContain('Tests de la journée 1 reporté de la semaine dernière.');
    // Reportée après le 1er décembre, la journée 1 se fait au gym ; son sprint, dans la séance piste.
    const tests = s2.seances.find((s) => s.seance.test === 'journee1')!.seance;
    expect(ids(tests)).toContain('T-F1');
    expect(tests.lieu).toBe('gym');
    expect(ids(s2.seances.find((s) => s.seance.test === 'sprint')!.seance)).toContain('T-sprint-10');
  });

  it('écart de plus de 10 % entre les côtés : 1 série de plus du côté le plus faible', () => {
    const d = donnees([1, 2]);
    const a = seanceDe(d, 1, 'A');
    enregistrer(d, 1, a, {
      'tests:T-F7': { mesure: { gauche: 16, droite: 18 }, unite: 'kg' },
      'tests:T-mollet': { mesure: { gauche: 25, droite: 24 } },
    });
    expect(seriesEnPlus(d)).toEqual({ F7: { cote: 'gauche', ecart: 11 } });
    const b2 = seanceDe(d, 2, 'B');
    expect(b2.contenu.blocs.find((x) => x.type === 'force')!.exercices.find((p) => p.id === 'F7')?.serieEnPlus).toEqual({ cote: 'gauche', ecart: 11 });
  });
});

describe('semaine légère anticipée (section 6)', () => {
  it('plus de semaine légère automatique (décision de Lily) : 2 séances à 9 ne changent pas la semaine suivante', () => {
    const d = donnees([2, 3]);
    for (const type of ['A', 'B']) enregistrer(d, 2, seanceDe(d, 2, type), {}, { effort: 9 });
    expect(semainesLegeresAnticipees(d)).toEqual([]);
    expect(saison(d)[2]!.semaine.legere).toBeNull();
    // La règle reste écrite, désactivée : elle se rallume avec le 3e paramètre.
    expect(semainesLegeresAnticipees(d, [], true).map((l) => l.semaine)).toEqual([3]);
  });

  it('douleur de 3 ou 4 à deux endroits : pas de semaine légère automatique non plus', () => {
    const d = donnees([2]);
    enregistrer(d, 2, seanceDe(d, 2, 'C'), {}, { douleurs: { tibias: 3, genou: 4 } });
    expect(semainesLegeresAnticipees(d)).toEqual([]);
    expect(semainesLegeresAnticipees(d, [], true).map((l) => l.semaine)).toEqual([3]);
  });

  it('quand Lily la demande, et le compte des semaines normales repart à zéro', () => {
    const d = donnees([3]);
    d.legeresDemandees = [3];
    const s = saison(d);
    expect(s[2]!.semaine.legere?.raisons).toContain('Semaine légère demandée');
    expect(s[2]!.legereDemandee).toBe(true);
  });
});
