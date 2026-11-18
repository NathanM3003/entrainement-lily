// Stockage sur le téléphone (IndexedDB), sans serveur ni compte.
// Une seule table clé-valeur.
// - Réglages communs : « preferences », « statuts », « programmes » (la liste), « actif » (le programme suivi).
// - Chaque programme : « p:<id>:programme », « p:<id>:choix:<semaine> », « p:<id>:resultat:<date> »,
//   « p:<id>:legeres », « p:<id>:saison », « p:<id>:notesMatchs », « p:<id>:routines ».
// Les données d'avant les programmes multiples (clés sans « p:<id>: ») deviennent le premier programme.

import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import type { ChoixSemaine } from '../moteur/semaine';
import type { ProgrammeConfig } from '../moteur/types';
import { DONNEES_VIDES, type Donnees, type MetaProgramme, type Preferences, type ResultatSeance } from './types';

const NOM_BASE = 'entrainement-lily';
const TABLE = 'donnees';

let base: Promise<IDBDatabase> | null = null;
/** Préfixe des clés du programme suivi. */
let prefixe = '';

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

function transaction(): Promise<{ t: IDBObjectStore; fin: Promise<void> }> {
  return ouvrir().then((db) => {
    const tx = db.transaction(TABLE, 'readwrite');
    const fin = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { t: tx.objectStore(TABLE), fin };
  });
}

const CLES_PROGRAMME = ['programme', 'legeres', 'saison', 'notesMatchs', 'routines'];
const estCleProgramme = (cle: string) => cle.startsWith('choix:') || cle.startsWith('resultat:') || CLES_PROGRAMME.includes(cle);

/** Range une clé de programme (sans préfixe) dans les données. */
function lireCle(donnees: Donnees, cle: string, valeur: unknown) {
  if (cle.startsWith('choix:')) donnees.choix[Number(cle.slice(6))] = valeur as ChoixSemaine;
  else if (cle.startsWith('resultat:')) donnees.resultats[cle.slice(9)] = valeur as ResultatSeance;
  else if (cle === 'legeres') donnees.legeresDemandees = valeur as number[];
  else if (cle === 'saison') donnees.saison = valeur as Donnees['saison'];
  else if (cle === 'notesMatchs') donnees.notesMatchs = valeur as Donnees['notesMatchs'];
  else if (cle === 'routines') donnees.routinesMaison = valeur as string[];
  else if (cle === 'programme') donnees.programme = valeur as ProgrammeConfig;
}

/** Les clés d'un programme, sans préfixe, pour l'écrire d'un coup. */
function clesDe(d: Donnees): [string, unknown][] {
  return [
    ...(d.programme ? [['programme', d.programme] as [string, unknown]] : []),
    ...Object.entries(d.choix).map(([n, c]) => [`choix:${n}`, c] as [string, unknown]),
    ...Object.values(d.resultats).map((r) => [`resultat:${r.date}`, r] as [string, unknown]),
    ['legeres', d.legeresDemandees],
    ['saison', d.saison],
    ['notesMatchs', d.notesMatchs],
    ['routines', d.routinesMaison],
  ];
}

export interface Etat {
  programmes: MetaProgramme[];
  actif?: string;
  /** Données du programme suivi (avec les réglages communs). Absentes s'il n'y a aucun programme. */
  donnees: Donnees;
}

const nouvelId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Charge la liste des programmes et les données du programme suivi. Range les anciennes données dans un 1er programme. */
export async function chargerTout(): Promise<Etat> {
  const t = await table('readonly');
  const [cles, valeurs] = await Promise.all([attendre(t.getAllKeys()), attendre(t.getAll())]);
  const parCle = new Map(cles.map((c, i) => [String(c), valeurs[i]]));
  let programmes = (parCle.get('programmes') as MetaProgramme[] | undefined) ?? [];
  let actif = parCle.get('actif') as string | undefined;

  // Anciennes données (un seul programme, sans préfixe) : elles deviennent le premier programme.
  const anciennes = [...parCle.keys()].filter(estCleProgramme);
  if (anciennes.length && programmes.length === 0) {
    const id = nouvelId();
    const config = (parCle.get('programme') as ProgrammeConfig | undefined) ?? SAISON_2026_2027;
    const { t: tw, fin } = await transaction();
    for (const cle of anciennes) {
      tw.put(parCle.get(cle), `p:${id}:${cle}`);
      tw.delete(cle);
    }
    tw.put(config, `p:${id}:programme`);
    programmes = [{ id, nom: config.nom, creeLe: new Date().toISOString().slice(0, 10) }];
    actif = id;
    tw.put(programmes, 'programmes');
    tw.put(actif, 'actif');
    await fin;
    return chargerTout();
  }

  if (actif && !programmes.some((p) => p.id === actif)) actif = programmes[0]?.id;
  prefixe = actif ? `p:${actif}:` : '';
  const donnees: Donnees = structuredClone(DONNEES_VIDES);
  donnees.preferences = { ...donnees.preferences, ...(parCle.get('preferences') as Preferences | undefined) };
  donnees.statuts = (parCle.get('statuts') as Donnees['statuts'] | undefined) ?? {};
  if (actif) {
    for (const [cle, valeur] of parCle) if (cle.startsWith(prefixe)) lireCle(donnees, cle.slice(prefixe.length), valeur);
  }
  return { programmes, actif, donnees };
}

/** Crée un programme, le rend actif, et renvoie son id. */
export async function creerProgramme(config: ProgrammeConfig, programmes: MetaProgramme[]): Promise<{ id: string; programmes: MetaProgramme[] }> {
  const id = nouvelId();
  const liste = [...programmes, { id, nom: config.nom, creeLe: new Date().toISOString().slice(0, 10) }];
  const { t, fin } = await transaction();
  t.put(config, `p:${id}:programme`);
  t.put(liste, 'programmes');
  t.put(id, 'actif');
  await fin;
  prefixe = `p:${id}:`;
  return { id, programmes: liste };
}

export async function activerProgramme(id: string): Promise<void> {
  await attendre((await table('readwrite')).put(id, 'actif'));
}

export async function supprimerProgramme(id: string, programmes: MetaProgramme[]): Promise<MetaProgramme[]> {
  const t0 = await table('readonly');
  const cles = (await attendre(t0.getAllKeys())).map(String).filter((c) => c.startsWith(`p:${id}:`));
  const liste = programmes.filter((p) => p.id !== id);
  const { t, fin } = await transaction();
  for (const c of cles) t.delete(c);
  t.put(liste, 'programmes');
  if (liste[0]) t.put(liste[0].id, 'actif');
  else t.delete('actif');
  await fin;
  return liste;
}

/** Change la configuration du programme suivi (calendrier, blessures…) sans toucher à ses résultats. */
export async function enregistrerConfig(config: ProgrammeConfig, programmes: MetaProgramme[]): Promise<MetaProgramme[]> {
  const id = prefixe.slice(2, -1);
  const liste = programmes.map((p) => (p.id === id ? { ...p, nom: config.nom } : p));
  const { t, fin } = await transaction();
  t.put(config, `${prefixe}programme`);
  t.put(liste, 'programmes');
  await fin;
  return liste;
}

export async function enregistrerChoix(numero: number, choix: ChoixSemaine | null): Promise<void> {
  const t = await table('readwrite');
  if (choix) await attendre(t.put(choix, `${prefixe}choix:${numero}`));
  else await attendre(t.delete(`${prefixe}choix:${numero}`));
}

export async function enregistrerResultat(resultat: ResultatSeance): Promise<void> {
  await attendre((await table('readwrite')).put(resultat, `${prefixe}resultat:${resultat.date}`));
}

export async function supprimerResultat(date: string): Promise<void> {
  await attendre((await table('readwrite')).delete(`${prefixe}resultat:${date}`));
}

export async function enregistrerSaison(saison: Donnees['saison']): Promise<void> {
  await attendre((await table('readwrite')).put(saison, `${prefixe}saison`));
}

export async function enregistrerNotesMatchs(notes: Donnees['notesMatchs']): Promise<void> {
  await attendre((await table('readwrite')).put(notes, `${prefixe}notesMatchs`));
}

export async function enregistrerRoutines(jours: string[]): Promise<void> {
  await attendre((await table('readwrite')).put(jours, `${prefixe}routines`));
}

export async function enregistrerLegeres(semaines: number[]): Promise<void> {
  await attendre((await table('readwrite')).put(semaines, `${prefixe}legeres`));
}

export async function enregistrerStatuts(statuts: Donnees['statuts']): Promise<void> {
  await attendre((await table('readwrite')).put(statuts, 'statuts'));
}

export async function enregistrerPreferences(preferences: Preferences): Promise<void> {
  await attendre((await table('readwrite')).put(preferences, 'preferences'));
}

/** Toutes les données de tous les programmes (pour la sauvegarde). */
export async function lireTousLesProgrammes(programmes: MetaProgramme[]): Promise<{ meta: MetaProgramme; donnees: Donnees }[]> {
  const t = await table('readonly');
  const [cles, valeurs] = await Promise.all([attendre(t.getAllKeys()), attendre(t.getAll())]);
  return programmes.map((meta) => {
    const donnees: Donnees = structuredClone(DONNEES_VIDES);
    const p = `p:${meta.id}:`;
    cles.forEach((c, i) => {
      const cle = String(c);
      if (cle.startsWith(p)) lireCle(donnees, cle.slice(p.length), valeurs[i]);
    });
    return { meta, donnees };
  });
}

/** Remplace tout (import d'une sauvegarde). */
export async function remplacerTout(etat: {
  programmes: { meta: MetaProgramme; donnees: Donnees }[];
  actif?: string;
  preferences: Preferences;
  statuts: Donnees['statuts'];
}): Promise<void> {
  const { t, fin } = await transaction();
  t.clear();
  for (const { meta, donnees } of etat.programmes) for (const [cle, valeur] of clesDe(donnees)) t.put(valeur, `p:${meta.id}:${cle}`);
  t.put(
    etat.programmes.map((p) => p.meta),
    'programmes',
  );
  if (etat.actif) t.put(etat.actif, 'actif');
  t.put(etat.preferences, 'preferences');
  t.put(etat.statuts, 'statuts');
  await fin;
}

/** Demande au navigateur de ne pas effacer les données quand le téléphone manque de place. */
export async function demanderStockagePersistant(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Pas grave : la sauvegarde exportée reste la vraie sécurité.
  }
}
