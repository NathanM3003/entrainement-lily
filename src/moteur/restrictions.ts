import type { Exercice } from '../donnees/types';
import { ajouterJours, type DateISO } from './dates';
import type { ProgrammeConfig } from './types';

export interface EtatRestrictions {
  /** Intensité maximale des sprints, en %. */
  intensiteSprint: number;
  changementsDeDirection: boolean;
}

/** Restrictions qui s'appliquent à une date, quelle que soit la phase (Règles, section 0). */
export function restrictionsAu(config: ProgrammeConfig, date: DateISO): EtatRestrictions {
  const { sprint, changementsDeDirection } = config.restrictions;
  return {
    intensiteSprint: sprint && date <= sprint.jusquau ? sprint.intensiteMax : 100,
    changementsDeDirection: !changementsDeDirection || date > changementsDeDirection.jusquau,
  };
}

/**
 * Date à partir de laquelle un exercice peut être programmé (date « Dès » de la banque).
 * « décembre » = quand le sprint à 100 % est permis ; « janvier » = quand les changements de direction le sont.
 * Renvoie null pour un exercice exclu : il n'est jamais programmé.
 */
export function dateDeblocage(exercice: Exercice, config: ProgrammeConfig): DateISO | null {
  if (exercice.statut === 'exclu') return null;
  const { sprint, changementsDeDirection } = config.restrictions;
  switch (exercice.des) {
    case 'maintenant':
      return config.debut;
    case 'decembre':
      return sprint ? maxDate(config.debut, ajouterJours(sprint.jusquau, 1)) : config.debut;
    case 'janvier':
      return changementsDeDirection ? maxDate(config.debut, ajouterJours(changementsDeDirection.jusquau, 1)) : config.debut;
  }
}

/** L'exercice est-il permis à cette date ? (statut et date « Dès » seulement ; la phase est traitée ailleurs). */
export function exerciceDebloque(exercice: Exercice, config: ProgrammeConfig, date: DateISO): boolean {
  const des = dateDeblocage(exercice, config);
  return des !== null && date >= des;
}

const maxDate = (a: DateISO, b: DateISO): DateISO => (a > b ? a : b);
