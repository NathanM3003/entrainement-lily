import { describe, expect, it } from 'vitest';
import { exercice, exercices } from '../donnees/banque';
import { SAISON_2026_2027 as config } from '../donnees/saison-2026-2027';
import { dateDeblocage, exerciceDebloque, restrictionsAu } from './restrictions';

// Règles, section 3, « Restrictions datées ».
describe('restrictions de la saison 2026-2027', () => {
  it('limite le sprint à 80 % jusqu’au 30 novembre, puis 100 %', () => {
    expect(restrictionsAu(config, '2026-11-30').intensiteSprint).toBe(80);
    expect(restrictionsAu(config, '2026-12-01').intensiteSprint).toBe(100);
  });

  it('bloque les changements de direction jusqu’au 31 décembre', () => {
    expect(restrictionsAu(config, '2026-12-31').changementsDeDirection).toBe(false);
    expect(restrictionsAu(config, '2027-01-01').changementsDeDirection).toBe(true);
  });

  it('bloque V9, V11, P7, E11 et E12 jusqu’au 30 novembre', () => {
    for (const id of ['V9', 'V11', 'P7', 'E11', 'E12']) {
      expect(exerciceDebloque(exercice(id), config, '2026-11-30'), id).toBe(false);
      expect(exerciceDebloque(exercice(id), config, '2026-12-01'), id).toBe(true);
    }
  });

  it('bloque A4, A12, A8, A9, P14 et P15 jusqu’au 1er janvier', () => {
    for (const id of ['A4', 'A12', 'A8', 'A9', 'P14', 'P15']) {
      expect(exerciceDebloque(exercice(id), config, '2026-12-31'), id).toBe(false);
      expect(dateDeblocage(exercice(id), config), id).toBe('2027-01-01');
    }
  });

  it('ne débloque jamais un exercice exclu', () => {
    for (const e of exercices.filter((x) => x.statut === 'exclu')) {
      expect(exerciceDebloque(e, config, '2027-03-12'), e.id).toBe(false);
    }
  });

  it('permet les exercices « maintenant » dès le début du programme', () => {
    expect(exerciceDebloque(exercice('F1'), config, '2026-11-23')).toBe(true);
    expect(exerciceDebloque(exercice('F1'), config, '2026-11-22')).toBe(false);
  });
});
