// Fichier de sauvegarde : export et import de toutes les données de Lily, tous programmes compris (pas de serveur).

import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { ecartJours, type DateISO } from '../moteur/dates';
import { DONNEES_VIDES, type Donnees, type MetaProgramme, type Preferences } from './types';

const FORMAT = 'entrainement-lily';
const VERSION = 2;

export interface Sauvegarde {
  programmes: { meta: MetaProgramme; donnees: Donnees }[];
  actif?: string;
  preferences: Preferences;
  statuts: Donnees['statuts'];
}

export function creerSauvegarde(s: Sauvegarde, aujourdhui: DateISO): { nom: string; contenu: string } {
  // Les réglages communs sont rangés à part : on ne les répète pas dans chaque programme.
  const programmes = s.programmes.map(({ meta, donnees }) => {
    const { preferences: _p, statuts: _s, ...propres } = donnees;
    return { meta, donnees: propres };
  });
  return {
    nom: `entrainement-lily-${aujourdhui}.json`,
    contenu: JSON.stringify({ format: FORMAT, version: VERSION, exporteLe: aujourdhui, ...s, programmes }, null, 1),
  };
}

function programmeDe(d: Partial<Donnees>, preferences: Preferences, statuts: Donnees['statuts']): Donnees {
  return {
    ...(d.programme ? { programme: d.programme } : {}),
    statuts,
    preferences,
    choix: d.choix ?? {},
    legeresDemandees: Array.isArray(d.legeresDemandees) ? d.legeresDemandees : [],
    saison: { matchsReguliers: d.saison?.matchsReguliers ?? [], tournois: d.saison?.tournois ?? [] },
    notesMatchs: d.notesMatchs ?? {},
    routinesMaison: Array.isArray(d.routinesMaison) ? d.routinesMaison : [],
    resultats: d.resultats ?? {},
  };
}

/** Lit un fichier de sauvegarde (version 1 : un seul programme ; version 2 : plusieurs). Lance une erreur claire sinon. */
export function lireSauvegarde(texte: string): Sauvegarde {
  let objet: unknown;
  try {
    objet = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde de l'app (il ne se lit pas).");
  }
  const o = objet as {
    format?: unknown;
    version?: unknown;
    donnees?: Partial<Donnees>;
    programmes?: { meta: MetaProgramme; donnees: Partial<Donnees> }[];
    actif?: string;
    preferences?: Preferences;
    statuts?: Donnees['statuts'];
  };
  if (!o || o.format !== FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde de l'app d'entraînement.");
  if (typeof o.version !== 'number' || o.version > VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'app. Mets l'app à jour, puis réessaie.");
  }
  if (o.version === 1) {
    const d = o.donnees;
    if (!d || typeof d.choix !== 'object' || typeof d.resultats !== 'object') throw new Error('Cette sauvegarde est incomplète.');
    const preferences = { ...DONNEES_VIDES.preferences, ...d.preferences };
    const statuts = d.statuts ?? {};
    const donnees = programmeDe({ ...d, programme: d.programme ?? SAISON_2026_2027 }, preferences, statuts);
    return { programmes: [{ meta: { id: 'p1', nom: donnees.programme!.nom, creeLe: '' }, donnees }], actif: 'p1', preferences, statuts };
  }
  if (!Array.isArray(o.programmes)) throw new Error('Cette sauvegarde est incomplète.');
  const preferences = { ...DONNEES_VIDES.preferences, ...o.preferences };
  const statuts = o.statuts ?? {};
  return {
    programmes: o.programmes.map((p) => ({ meta: p.meta, donnees: programmeDe(p.donnees, preferences, statuts) })),
    actif: o.actif,
    preferences,
    statuts,
  };
}

/** Rappel hebdomadaire : rien d'exporté depuis 7 jours alors qu'il y a des résultats. */
export function rappelSauvegarde(donnees: Donnees, aujourdhui: DateISO): boolean {
  if (Object.keys(donnees.resultats).length === 0) return false;
  const derniere = donnees.preferences.derniereSauvegarde;
  return !derniere || ecartJours(derniere, aujourdhui) >= 7;
}
