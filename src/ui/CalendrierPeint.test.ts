import { describe, expect, it } from 'vitest';
import { sansJour } from './CalendrierPeint';

const serie = { nom: '4 contre 4', jour: 3 as const, debut: '2027-01-13' };

describe('Gomme sur un frisbee chaque semaine', () => {
  it('coupe la série en deux autour du jour effacé', () => {
    expect(sansJour([serie], '2027-01-27')).toEqual([
      { ...serie, fin: '2027-01-20' },
      { ...serie, debut: '2027-02-03' },
    ]);
  });
  it('décale le début quand on efface le premier jour', () => {
    expect(sansJour([serie], '2027-01-13')).toEqual([{ ...serie, debut: '2027-01-20' }]);
  });
  it('retire une série d’un seul jour', () => {
    expect(sansJour([{ ...serie, fin: '2027-01-13' }], '2027-01-13')).toEqual([]);
  });
  it('ne touche à rien un autre jour', () => {
    const series = [serie];
    expect(sansJour(series, '2027-01-28')).toBe(series);
  });
});
