import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from '../moteur/calendrier';
import { joursEntre } from '../moteur/dates';
import { calculerSaison } from './saison';
import { bilan, calculerSuivi } from './suivi';
import { DONNEES_VIDES, type Donnees, type ResultatExercice } from './types';

const cal = genererCalendrier(SAISON_2026_2027);
const jours = (n: number) => joursEntre(cal.semaines[n - 1]!.debut, cal.semaines[n - 1]!.fin);

function donnees(semaines: number[], nb = 3): Donnees {
  const d = structuredClone(DONNEES_VIDES);
  for (const n of semaines) d.choix[n] = { nbSeances: nb, joursDisponibles: jours(n) };
  return d;
}

/** Termine toutes les séances d'une semaine, avec des résultats par type de séance. */
function faireSemaine(d: Donnees, n: number, exercices: Record<string, Record<string, ResultatExercice>> = {}, extra = {}) {
  for (const s of calculerSaison(cal, d, '2026-11-20')[n - 1]!.seances) {
    d.resultats[s.seance.date] = {
      date: s.seance.date,
      semaine: n,
      seance: s.seance,
      exercices: exercices[s.seance.type] ?? {},
      terminee: true,
      modifieLe: s.seance.date,
      effort: 6,
      ...extra,
    };
  }
}

const suivi = (d: Donnees, aujourdhui: string) => calculerSuivi(calculerSaison(cal, d, aujourdhui), d, aujourdhui);

describe('série de semaines complètes (section 7)', () => {
  it('compte les semaines où toutes les séances choisies sont faites, une semaine incomplète la remet à zéro', () => {
    const d = donnees([1, 2, 3, 4, 5]);
    faireSemaine(d, 1);
    faireSemaine(d, 2);
    expect(suivi(d, '2026-12-08').serie).toEqual({ actuelle: 2, meilleure: 2 });
    // S3 pas faite : la série repart de zéro une fois la semaine finie.
    expect(suivi(d, '2026-12-15').serie).toEqual({ actuelle: 0, meilleure: 2 });
  });

  it('la semaine en cours ne casse pas la série tant qu’elle n’est pas finie', () => {
    const d = donnees([1, 2]);
    faireSemaine(d, 1);
    expect(suivi(d, '2026-12-01').serie.actuelle).toBe(1);
  });

  it('badge de régularité à 4 semaines de suite', () => {
    const d = donnees([1, 2, 3, 4]);
    for (const n of [1, 2, 3, 4]) faireSemaine(d, n);
    const b = suivi(d, '2026-12-21').badges.find((x) => x.id === 'serie-4');
    expect(b?.date).toBeDefined();
    expect(suivi(d, '2026-12-21').badges.find((x) => x.id === 'serie-8')?.date).toBeUndefined();
  });
});

describe('records et badges', () => {
  it('records : maximum estimé, saut en longueur ; un badge à chaque record battu', () => {
    const d = donnees([1, 2, 3]);
    faireSemaine(d, 1, {
      A: { 'tests:T-F1': { mesure: { valeur: 50 }, unite: 'kg' }, 'tests:T-saut': { mesure: { valeur: 190 } } },
      B: { 'force:F1': { series: [{ reps: 8, charge: 40 }, { reps: 8, charge: 40 }, { reps: 12, charge: 40 }], unite: 'kg' } },
    });
    const s = suivi(d, '2026-11-30');
    const f1 = s.records.find((r) => r.id === '1rm-F1')!;
    // 40 × (1 + 14 ÷ 30) = 58,7 < 60 (test) : pas de nouveau record.
    expect(f1).toMatchObject({ valeur: 60, battu: 0 });
    expect(s.records.find((r) => r.id === 'saut')).toMatchObject({ valeur: 190, unite: 'cm' });
    faireSemaine(d, 2, { B: { 'force:F1': { series: [{ reps: 8, charge: 45 }, { reps: 8, charge: 45 }, { reps: 12, charge: 45 }], unite: 'kg' } } });
    const s2 = suivi(d, '2026-12-07');
    expect(s2.records.find((r) => r.id === '1rm-F1')).toMatchObject({ valeur: 66, battu: 1 });
    expect(s2.badges.filter((b) => b.categorie === 'record' && b.date)).toHaveLength(1);
  });

  it('sprint : le plus petit temps est le record', () => {
    const d = donnees([2, 3]);
    faireSemaine(d, 2, { A: { 'vitesse:T-sprint-10': { mesure: { valeur: 2.1 } } } });
    expect(suivi(d, '2026-12-07').records.find((r) => r.id === 'sprint-10')).toMatchObject({ valeur: 2.1, plusPetitEstMieux: true });
  });

  it('jalons : 1re séance, 10 séances ; tous les badges à venir sont listés sans date', () => {
    const d = donnees([1, 2, 3, 4]);
    for (const n of [1, 2, 3, 4]) faireSemaine(d, n);
    const s = suivi(d, '2026-12-21');
    expect(s.seancesFaites).toBe(12);
    expect(s.badges.find((b) => b.id === 'seances-1')?.date).toBe('2026-11-23');
    expect(s.badges.find((b) => b.id === 'seances-10')?.date).toBeDefined();
    expect(s.badges.find((b) => b.id === 'seances-25')?.date).toBeUndefined();
    expect(s.badges.find((b) => b.id === 'prete')).toBeDefined();
    expect(s.badges.find((b) => b.id === 'sprint-100')?.date).toBe('2026-12-01');
  });

  it('« Bien chaud » : 10 séances avec l’échauffement coché en entier', () => {
    const d = donnees([1, 2, 3, 4]);
    for (const n of [1, 2, 3, 4]) faireSemaine(d, n);
    const toutCocher = (limite: number) => {
      const liste = Object.values(d.resultats).sort((a, b) => (a.date < b.date ? -1 : 1));
      liste.forEach((r, i) => {
        const ids = r.seance.contenu.blocs.find((b) => b.type === 'echauffement')?.exercices.map((p) => p.id) ?? [];
        r.echauffementFait = i < limite ? ids : ids.slice(1);
      });
      return liste;
    };
    toutCocher(9);
    expect(suivi(d, '2026-12-21').badges.find((b) => b.id === 'bien-chaud')?.date).toBeUndefined();
    const liste = toutCocher(10);
    expect(suivi(d, '2026-12-21').badges.find((b) => b.id === 'bien-chaud')?.date).toBe(liste[9]!.date);
  });

  it('aucun badge ni record lié au poids', () => {
    const s = suivi(donnees([1]), '2026-11-20');
    expect(JSON.stringify(s).toLowerCase()).not.toMatch(/poids corporel|masse|kilos perdus/);
  });
});

describe('bilan de préparation (section 6)', () => {
  it('compare la première et la dernière mesure de chaque test, avec l’écart entre les côtés', () => {
    const d = donnees([1, 10]);
    faireSemaine(d, 1, { A: { 'tests:T-saut': { mesure: { valeur: 180 } }, 'tests:T-F7': { mesure: { gauche: 16, droite: 18 }, unite: 'kg' } } });
    const s10 = calculerSaison(cal, d, '2026-11-20')[9]!.seances.find((s) => s.seance.test === 'journee1')!.seance;
    d.resultats[s10.date] = {
      date: s10.date,
      semaine: 10,
      seance: s10,
      exercices: { 'tests:T-saut': { mesure: { valeur: 198 } }, 'tests:T-F7': { mesure: { gauche: 20, droite: 21 }, unite: 'kg' } },
      terminee: true,
      modifieLe: s10.date,
    };
    const lignes = bilan(d);
    expect(lignes.find((l) => l.test === 'T-saut')).toMatchObject({ evolution: { valeur: 18, pourcentage: 10 } });
    expect(lignes.find((l) => l.test === 'T-F7')).toMatchObject({ ecartCotes: 5, evolution: { valeur: 3.5 } });
  });
});
