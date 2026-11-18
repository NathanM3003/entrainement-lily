// Fichier de sauvegarde : export et import de toutes les données de Lily (pas de serveur).

import { ecartJours, type DateISO } from '../moteur/dates';
import { DONNEES_VIDES, type Donnees } from './types';

const FORMAT = 'entrainement-lily';
const VERSION = 1;

export function creerSauvegarde(donnees: Donnees, aujourdhui: DateISO): { nom: string; contenu: string } {
  return {
    nom: `entrainement-lily-${aujourdhui}.json`,
    contenu: JSON.stringify({ format: FORMAT, version: VERSION, exporteLe: aujourdhui, donnees }, null, 1),
  };
}

/** Lit un fichier de sauvegarde. Lance une erreur avec un message clair si le fichier ne convient pas. */
export function lireSauvegarde(texte: string): Donnees {
  let objet: unknown;
  try {
    objet = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde de l'app (il ne se lit pas).");
  }
  const o = objet as { format?: unknown; version?: unknown; donnees?: Partial<Donnees> };
  if (!o || o.format !== FORMAT || !o.donnees) throw new Error("Ce fichier n'est pas une sauvegarde de l'app d'entraînement.");
  if (typeof o.version !== 'number' || o.version > VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'app. Mets l'app à jour, puis réessaie.");
  }
  const d = o.donnees;
  if (typeof d.choix !== 'object' || typeof d.resultats !== 'object') throw new Error('Cette sauvegarde est incomplète.');
  return {
    choix: d.choix ?? {},
    legeresDemandees: Array.isArray(d.legeresDemandees) ? d.legeresDemandees : [],
    resultats: d.resultats ?? {},
    preferences: { ...DONNEES_VIDES.preferences, ...d.preferences },
  };
}

/** Rappel hebdomadaire : rien d'exporté depuis 7 jours alors qu'il y a des résultats. */
export function rappelSauvegarde(donnees: Donnees, aujourdhui: DateISO): boolean {
  if (Object.keys(donnees.resultats).length === 0) return false;
  const derniere = donnees.preferences.derniereSauvegarde;
  return !derniere || ecartJours(derniere, aujourdhui) >= 7;
}
