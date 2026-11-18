import { describe, expect, it } from 'vitest';
import { decouperPhases, rangSemaineCoupure } from './phases';

const durees = (n: number) => Object.fromEntries(decouperPhases(n).segments.map((s) => [s.phase, s.semaines]));

// Règles, section 1, tableau des durées.
describe('durée des phases', () => {
  it.each([
    [8, { fondation: 2, 'force-vitesse': 3, 'puissance-repetition': 2, affutage: 1 }],
    [12, { fondation: 4, 'force-vitesse': 3, 'puissance-repetition': 3, affutage: 2 }],
    [16, { fondation: 5, 'force-vitesse': 5, 'puissance-repetition': 4, affutage: 2 }],
    [20, { fondation: 6, 'force-vitesse': 6, 'puissance-repetition': 6, affutage: 2 }],
  ])('%i semaines', (n, attendu) => {
    expect(durees(n)).toEqual(attendu);
  });

  it("garde 1 seule semaine d'affûtage sous 10 semaines", () => {
    expect(durees(9).affutage).toBe(1);
    expect(durees(10).affutage).toBe(2);
  });

  it('arrondit 30 % de N au plus proche (15 semaines → 5)', () => {
    expect(durees(15).fondation).toBe(5);
  });

  it('borne la Fondation entre 2 et 6 semaines', () => {
    expect(durees(5).fondation).toBe(2);
    expect(durees(30).fondation).toBe(6);
  });

  it('fusionne les phases 2 et 3 en « Développement » quand il reste moins de 4 semaines', () => {
    expect(durees(6)).toEqual({ fondation: 2, developpement: 3, affutage: 1 });
  });

  it("propose un maintien et 1 semaine d'affûtage sous 4 semaines, avec un avertissement", () => {
    const r = decouperPhases(3);
    expect(r.segments).toEqual([
      { phase: 'maintien', semaines: 2 },
      { phase: 'affutage', semaines: 1 },
    ]);
    expect(r.avertissement).toBeDefined();
  });

  it('additionne toujours N semaines', () => {
    for (let n = 1; n <= 40; n++) {
      expect(decouperPhases(n).segments.reduce((t, s) => t + s.semaines, 0)).toBe(n);
    }
  });

  it('coupe une phase de plus de 6 semaines par une semaine plus légère', () => {
    expect(rangSemaineCoupure(6)).toBeNull();
    expect(rangSemaineCoupure(7)).toBe(4);
  });
});
