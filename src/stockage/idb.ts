// Stockage sur le téléphone (IndexedDB), sans serveur ni compte.
// Une seule table clé-valeur : « choix:<semaine> », « resultat:<date> » et « preferences ».

import { DONNEES_VIDES, type Donnees, type Preferences, type ResultatSeance } from './types';
import type { ChoixSemaine } from '../moteur/semaine';

const NOM_BASE = 'entrainement-lily';
const TABLE = 'donnees';

let base: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  base ??= new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(TABLE);
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
  return base;
}

function attendre<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
}

async function table(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await ouvrir()).transaction(TABLE, mode).objectStore(TABLE);
}

export async function chargerDonnees(): Promise<Donnees> {
  const t = await table('readonly');
  const [cles, valeurs] = await Promise.all([attendre(t.getAllKeys()), attendre(t.getAll())]);
  const donnees: Donnees = structuredClone(DONNEES_VIDES);
  cles.forEach((cle, i) => {
    const valeur = valeurs[i];
    const texte = String(cle);
    if (texte.startsWith('choix:')) donnees.choix[Number(texte.slice(6))] = valeur as ChoixSemaine;
    else if (texte.startsWith('resultat:')) donnees.resultats[texte.slice(9)] = valeur as ResultatSeance;
    else if (texte === 'preferences') donnees.preferences = { ...donnees.preferences, ...(valeur as Preferences) };
    else if (texte === 'legeres') donnees.legeresDemandees = valeur as number[];
    else if (texte === 'saison') donnees.saison = valeur as Donnees['saison'];
    else if (texte === 'notesMatchs') donnees.notesMatchs = valeur as Donnees['notesMatchs'];
    else if (texte === 'routines') donnees.routinesMaison = valeur as string[];
  });
  return donnees;
}

export async function enregistrerChoix(numero: number, choix: ChoixSemaine | null): Promise<void> {
  const t = await table('readwrite');
  if (choix) await attendre(t.put(choix, `choix:${numero}`));
  else await attendre(t.delete(`choix:${numero}`));
}

export async function enregistrerResultat(resultat: ResultatSeance): Promise<void> {
  await attendre((await table('readwrite')).put(resultat, `resultat:${resultat.date}`));
}

export async function supprimerResultat(date: string): Promise<void> {
  await attendre((await table('readwrite')).delete(`resultat:${date}`));
}

export async function enregistrerSaison(saison: Donnees['saison']): Promise<void> {
  await attendre((await table('readwrite')).put(saison, 'saison'));
}

export async function enregistrerNotesMatchs(notes: Donnees['notesMatchs']): Promise<void> {
  await attendre((await table('readwrite')).put(notes, 'notesMatchs'));
}

export async function enregistrerRoutines(jours: string[]): Promise<void> {
  await attendre((await table('readwrite')).put(jours, 'routines'));
}

export async function enregistrerLegeres(semaines: number[]): Promise<void> {
  await attendre((await table('readwrite')).put(semaines, 'legeres'));
}

export async function enregistrerPreferences(preferences: Preferences): Promise<void> {
  await attendre((await table('readwrite')).put(preferences, 'preferences'));
}

/** Remplace toutes les données (import d'une sauvegarde). */
export async function remplacerDonnees(donnees: Donnees): Promise<void> {
  const db = await ouvrir();
  const tx = db.transaction(TABLE, 'readwrite');
  const t = tx.objectStore(TABLE);
  t.clear();
  for (const [numero, choix] of Object.entries(donnees.choix)) t.put(choix, `choix:${numero}`);
  for (const resultat of Object.values(donnees.resultats)) t.put(resultat, `resultat:${resultat.date}`);
  t.put(donnees.preferences, 'preferences');
  t.put(donnees.legeresDemandees, 'legeres');
  t.put(donnees.saison, 'saison');
  t.put(donnees.notesMatchs, 'notesMatchs');
  t.put(donnees.routinesMaison, 'routines');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Demande au navigateur de ne pas effacer les données quand le téléphone manque de place. */
export async function demanderStockagePersistant(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Pas grave : la sauvegarde exportée reste la vraie sécurité.
  }
}
