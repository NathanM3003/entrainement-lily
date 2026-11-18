// Dates sans heure ni fuseau, au format ISO « AAAA-MM-JJ ».
// Tous les calculs passent par l'UTC pour éviter les décalages d'heure d'été.

export type DateISO = string;

/** 1 = lundi … 7 = dimanche. */
export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MS_JOUR = 86_400_000;

function versMs(d: DateISO): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Date invalide : ${d}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== d) throw new Error(`Date invalide : ${d}`);
  return ms;
}

const depuisMs = (ms: number): DateISO => new Date(ms).toISOString().slice(0, 10);

export const ajouterJours = (d: DateISO, n: number): DateISO => depuisMs(versMs(d) + n * MS_JOUR);

export const ecartJours = (de: DateISO, a: DateISO): number => Math.round((versMs(a) - versMs(de)) / MS_JOUR);

export function jourSemaine(d: DateISO): JourSemaine {
  const j = new Date(versMs(d)).getUTCDay(); // 0 = dimanche
  return (j === 0 ? 7 : j) as JourSemaine;
}

/** Le lundi de la semaine qui contient cette date. */
export const lundiDe = (d: DateISO): DateISO => ajouterJours(d, 1 - jourSemaine(d));

/** Toutes les dates de « debut » à « fin », incluses. */
export function joursEntre(debut: DateISO, fin: DateISO): DateISO[] {
  const n = ecartJours(debut, fin);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => ajouterJours(debut, i));
}

export const dansIntervalle = (d: DateISO, debut: DateISO, fin: DateISO): boolean => d >= debut && d <= fin;

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** « 23 nov. », « 1er déc. » */
export function dateCourte(d: DateISO): string {
  const [, m, j] = d.split('-').map(Number) as [number, number, number];
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
}
