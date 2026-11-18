import { describe, expect, it } from 'vitest';
import illustrations from './illustrations.generated.json';
import { exercice, exercices, exercicesRetenus } from './banque';

// Chiffres du bilan de docs/Banque d'exercices.md.
describe("banque d'exercices", () => {
  it('compte 84 retenus (76 validés, 8 à essayer) et 15 exclus', () => {
    expect(exercicesRetenus).toHaveLength(84);
    expect(exercices.filter((e) => e.statut === 'valide')).toHaveLength(76);
    expect(exercices.filter((e) => e.statut === 'a-essayer')).toHaveLength(8);
    expect(exercices.filter((e) => e.statut === 'exclu')).toHaveLength(15);
  });

  it('a des numéros uniques', () => {
    const ids = exercices.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a une illustration pour chaque exercice', () => {
    const sansDessin = exercices.filter((e) => !(e.id in illustrations)).map((e) => e.id);
    expect(sansDessin).toEqual([]);
  });

  it('donne un remplacement retenu à chaque exercice « à essayer »', () => {
    for (const e of exercicesRetenus.filter((x) => x.statut === 'a-essayer')) {
      expect(e.remplacements?.length, e.id).toBeGreaterThan(0);
      for (const r of e.remplacements ?? []) expect(exercice(r).statut, `${e.id} → ${r}`).toBe('valide');
    }
  });

  it('marque F5 comme exercice de réserve seulement', () => {
    const f5 = exercice('F5');
    expect(f5.statut === 'a-essayer' && f5.reserve).toBe(true);
  });

  it('reprend les dates « Dès » de la banque', () => {
    const des = (id: string) => {
      const e = exercice(id);
      return e.statut === 'exclu' ? null : e.des;
    };
    expect(['V9', 'V11', 'P7', 'E11', 'E12'].map(des)).toEqual(Array(5).fill('decembre'));
    expect(['A12', 'A4', 'A8', 'A9', 'P14', 'P15'].map(des)).toEqual(Array(6).fill('janvier'));
    expect(des('F1')).toBe('maintenant');
  });

  it('exclut le Nordic, le développé couché et la corde à sauter', () => {
    expect(['M9', 'F12', 'P2'].map((id) => exercice(id).statut)).toEqual(['exclu', 'exclu', 'exclu']);
  });
});
