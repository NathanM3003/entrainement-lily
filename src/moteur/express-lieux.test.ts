import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { calculerSaison } from '../stockage/saison';
import { bilanSemaine, calculerSuivi } from '../stockage/suivi';
import { DONNEES_VIDES, type Donnees } from '../stockage/types';
import { genererCalendrier } from './calendrier';
import { DUREE_EXPRESS, lieuxSeance } from './contenu';
import { joursEntre } from './dates';

const cal = genererCalendrier(SAISON_2026_2027);
const jours = (n: number) => joursEntre(cal.semaines[n - 1]!.debut, cal.semaines[n - 1]!.fin);
function donnees(n: number, express: string[] = []): Donnees {
  const d = structuredClone(DONNEES_VIDES);
  d.choix[n] = { nbSeances: 3, joursDisponibles: jours(n), express };
  return d;
}
const seances = (d: Donnees, n: number) => calculerSaison(cal, d, '2026-11-20')[n - 1]!.seances.map((s) => s.seance);

describe('lieu de chaque séance', () => {
  it('Fondation : A sur la piste, B au gym, C au gym puis course', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((t) => seances(donnees(3), 3).find((s) => s.type === t)!);
    expect(lieuxSeance(a!.contenu)).toBe('Piste');
    expect(lieuxSeance(b!.contenu)).toBe('Gym');
    expect(lieuxSeance(c!.contenu)).toBe('Gym, puis piste, tapis ou dehors');
  });

  it('sans piste : les sprints se font dehors', () => {
    const a = seances(donnees(3), 3).find((s) => s.type === 'A')!;
    expect(lieuxSeance(a.contenu, ['gym', 'tapis'])).toBe('Dehors, puis tapis ou dehors');
  });
});

describe('version express (manque de temps)', () => {
  it('tient en environ 40 min et garde le plus prioritaire, avec la prévention', () => {
    const normales = seances(donnees(3), 3);
    const dates = normales.map((s) => s.date);
    const express = seances(donnees(3, dates), 3);
    for (const s of express) {
      expect(s.express, s.type).toBe(true);
      expect(s.contenu.minutes, s.type).toBeLessThanOrEqual(DUREE_EXPRESS + 5);
      expect(s.contenu.blocs.at(-1)?.type).toBe('prevention');
    }
    // Fondation C : la course facile passe avant le haut du corps (section 4) : on peut aller courir dehors.
    const c = express.find((s) => s.type === 'C')!;
    expect(c.contenu.blocs.map((b) => b.type)).toContain('course');
    expect(c.contenu.blocs.find((b) => b.type === 'force')?.exercices.length ?? 0).toBeLessThanOrEqual(1);
    // B : la force du bas du corps d'abord.
    const b = express.find((s) => s.type === 'B')!;
    expect(b.contenu.blocs.find((x) => x.type === 'force')!.exercices.map((p) => p.id)).toContain('F1');
  });

  it('pas de version express pour une séance de tests', () => {
    const s1 = seances(donnees(1, jours(1)), 1);
    expect(s1.find((s) => s.test === 'journee1')!.express).toBeUndefined();
  });
});

describe('bilan de la semaine', () => {
  it('séances faites, effort moyen, message', () => {
    const d = donnees(3);
    const liste = seances(d, 3);
    for (const s of liste) d.resultats[s.date] = { date: s.date, semaine: 3, seance: s, exercices: {}, terminee: true, modifieLe: s.date, effort: 7, douleurs: { tibias: 3 } };
    const saison = calculerSaison(cal, d, '2026-12-13');
    const b = bilanSemaine(saison[2]!, calculerSuivi(saison, d, '2026-12-13'), d);
    expect(b).toMatchObject({ faites: 3, prevues: 3, effortMoyen: 7, douleurs: [{ zone: 'tibias', note: 3 }] });
    expect(b.message).toMatch(/^Semaine complète, bravo/);
  });
});
