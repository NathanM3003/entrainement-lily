import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from './calendrier';
import type { ProgrammeConfig } from './types';

const cal = genererCalendrier(SAISON_2026_2027);
const s = (n: number) => {
  const semaine = cal.semaines[n - 1];
  if (!semaine) throw new Error(`S${n} absente`);
  return semaine;
};

// Règles, section 1, « Calendrier de la saison 2026-2027 ».
describe('calendrier de la saison 2026-2027', () => {
  it('compte 16 semaines, du lundi 23 novembre au vendredi 12 mars', () => {
    expect(cal.semaines).toHaveLength(16);
    expect(cal.prelude).toEqual([]);
    expect(s(1)).toMatchObject({ debut: '2026-11-23', fin: '2026-11-29' });
    expect(s(16)).toMatchObject({ debut: '2027-03-08', fin: '2027-03-12' });
    expect(cal.avertissements).toEqual([]);
  });

  it.each([
    [1, '2026-11-23'],
    [2, '2026-11-30'],
    [5, '2026-12-21'],
    [6, '2026-12-28'],
    [7, '2027-01-04'],
    [9, '2027-01-18'],
    [10, '2027-01-25'],
    [11, '2027-02-01'],
    [13, '2027-02-15'],
    [15, '2027-03-01'],
  ])('S%i commence le %s', (n, debut) => {
    expect(s(n).debut).toBe(debut);
  });

  it('place les phases comme dans le tableau', () => {
    expect(cal.semaines.map((x) => x.phase)).toEqual([
      ...Array(5).fill('fondation'),
      ...Array(5).fill('force-vitesse'),
      ...Array(4).fill('puissance-repetition'),
      ...Array(2).fill('affutage'),
    ]);
  });

  it('a les semaines légères S5, S7, S10, début de S13, S15 et S16', () => {
    const legeres = cal.semaines.filter((x) => x.legere).map((x) => [x.numero, x.legere?.etendue]);
    expect(legeres).toEqual([
      [5, 'complete'],
      [7, 'complete'],
      [10, 'complete'],
      [13, 'debut'],
      [15, 'complete'],
      [16, 'complete'],
    ]);
  });

  it('garde S6 normale avec des jours allégés du 1er au 3 janvier (section 7)', () => {
    expect(s(6).legere).toBeNull();
    expect(s(6).joursAlleges).toEqual(['2027-01-01', '2027-01-02', '2027-01-03']);
    expect(s(7).joursAlleges).toHaveLength(7);
  });

  it('met le lundi et le mardi après chaque tournoi en récupération', () => {
    expect(s(10).joursRecuperation).toEqual(['2027-01-25', '2027-01-26']);
    expect(s(13).joursRecuperation).toEqual(['2027-02-15', '2027-02-16']);
    expect(s(16).joursRecuperation).toEqual(['2027-03-08', '2027-03-09']);
  });

  it('marque les semaines de tournoi S9, S12 et S15', () => {
    expect(cal.semaines.filter((x) => x.tournoi).map((x) => x.numero)).toEqual([9, 12, 15]);
  });

  it('commence le 4 contre 4 du mercredi le 13 janvier', () => {
    const matchs = cal.semaines.flatMap((x) => x.evenements.filter((e) => e.type === 'match').map((e) => e.date));
    expect(matchs[0]).toBe('2027-01-13');
    expect(matchs).toHaveLength(9); // S8 à S16, tous les mercredis
    expect(s(8).evenements.find((e) => e.type === 'match')?.date).toBe('2027-01-13');
  });

  it('signale la levée des restrictions le 1er décembre et le 1er janvier', () => {
    expect(s(2).evenements).toContainEqual({ date: '2026-12-01', type: 'sprint-100', nom: 'Sprint à 100 % permis' });
    expect(s(6).evenements.map((e) => e.type)).toContain('changements-de-direction');
  });

  it('place les retests du tableau de la section 6', () => {
    const r = cal.semaines.flatMap((x) => x.retests.map((t) => `S${x.numero} ${t.type}`));
    expect(r).toEqual([
      'S1 journee1',
      'S2 sprint',
      'S4 cooper',
      'S5 mini',
      'S10 journee1',
      'S11 cooper',
      'S14 journee1',
    ]);
    expect(s(14).retests[0]?.final).toBe(true);
    expect(cal.semaines.filter((x) => x.phase === 'affutage').flatMap((x) => x.retests)).toEqual([]);
  });

  it("n'ajoute aucune semaine légère : il n'y a jamais plus de 4 semaines normales de suite", () => {
    expect(cal.semaines.some((x) => x.legere?.raisons.includes('Pas plus de 4 semaines normales de suite'))).toBe(false);
  });
});

describe('calendrier : cas généraux', () => {
  const base: ProgrammeConfig = {
    nom: 'Test',
    debut: '2027-05-05', // un mercredi
    echeance: '2027-08-14',
    echeanceNom: 'Tournoi',
    restrictions: {},
    periodesAllegees: [],
    tournois: [],
    matchsReguliers: [],
    retests: [],
    semainesLegeres: [],
  };

  it('réserve les jours avant le premier lundi aux tests', () => {
    const c = genererCalendrier(base);
    expect(c.prelude).toEqual(['2027-05-05', '2027-05-06', '2027-05-07', '2027-05-08', '2027-05-09']);
    expect(c.semaines[0]?.debut).toBe('2027-05-10');
  });

  it('arrête la dernière semaine la veille de l’échéance', () => {
    const c = genererCalendrier(base);
    expect(c.semaines.at(-1)?.fin).toBe('2027-08-13');
  });

  it('rend légère une 5e semaine normale de suite', () => {
    const c = genererCalendrier(base);
    expect(c.semaines[4]?.legere?.raisons).toEqual(['Pas plus de 4 semaines normales de suite']);
    expect(c.semaines.slice(0, 4).every((x) => x.legere === null)).toBe(true);
  });

  it('refuse une échéance avant le début', () => {
    expect(() => genererCalendrier({ ...base, echeance: '2027-05-01' })).toThrow();
  });
});
