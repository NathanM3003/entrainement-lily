import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from '../moteur/calendrier';
import { joursEntre } from '../moteur/dates';
import { calculerSaison, decisionsEssais, semaineDuJour } from './saison';
import { cleExercice, convertirCharge, derniereCharge, distanceCooper, douleursDemandees, preremplir, texteAllure, texteCharge } from './saisie';
import { creerSauvegarde, lireSauvegarde, rappelSauvegarde } from './sauvegarde';
import { DONNEES_VIDES, type Donnees, type ResultatSeance } from './types';

const cal = genererCalendrier(SAISON_2026_2027);
const jours = (n: number) => joursEntre(cal.semaines[n - 1]!.debut, cal.semaines[n - 1]!.fin);

function donnees(): Donnees {
  return { ...structuredClone(DONNEES_VIDES), choix: { 1: { nbSeances: 3, joursDisponibles: jours(1) }, 2: { nbSeances: 3, joursDisponibles: jours(2) } } };
}

/** Termine une séance telle que prévue, avec des réponses en plus. */
function terminer(d: Donnees, numero: number, type: string, exercices: ResultatSeance['exercices'] = {}) {
  const s = calculerSaison(cal, d, '2026-11-20')[numero - 1]!.seances.find((x) => x.seance.type === type)!.seance;
  d.resultats[s.date] = { date: s.date, semaine: numero, seance: s, exercices, terminee: true, modifieLe: s.date };
  return s;
}

describe('saison recalculée à partir des entrées', () => {
  it('ouvre sur S1 avant le début du programme, puis sur la semaine du jour', () => {
    expect(semaineDuJour(cal, '2026-11-18')).toBe(1);
    expect(semaineDuJour(cal, '2027-01-13')).toBe(8);
    expect(semaineDuJour(cal, '2027-04-01')).toBe(16);
  });

  it('ne planifie que les semaines choisies par Lily', () => {
    const saison = calculerSaison(cal, donnees(), '2026-11-20');
    expect(saison[0]!.seances).toHaveLength(3);
    expect(saison[2]!.plan).toBeUndefined();
  });

  it('garde le contenu figé d’une séance commencée', () => {
    const d = donnees();
    const c = terminer(d, 1, 'C');
    d.resultats[c.date]!.seance = { ...c, libelle: 'Contenu figé' };
    const s = calculerSaison(cal, d, '2026-11-30')[0]!.seances.find((x) => x.seance.date === c.date)!;
    expect(s.seance.libelle).toBe('Contenu figé');
    expect(s.etat).toBe('faite');
  });

  it('marque comme manquée une séance passée sans saisie', () => {
    const s = calculerSaison(cal, donnees(), '2026-12-01')[0]!;
    expect(s.seances.every((x) => x.etat === 'manquee')).toBe(true);
  });

  it('compte les essais faits : F17 essayé en S1, F21 vient en S2', () => {
    const d = donnees();
    const c = terminer(d, 1, 'C');
    expect(c.contenu.essais).toEqual(['F17']);
    const s2 = calculerSaison(cal, d, '2026-11-30')[1]!.seances.find((x) => x.seance.type === 'C')!;
    expect(s2.seance.contenu.essais).toEqual(['F21']);
  });

  it('un essai marqué « pas fait » est reproposé', () => {
    const d = donnees();
    terminer(d, 1, 'C', { 'force:F17': { pasFait: { raison: 'materiel' } } });
    const s2 = calculerSaison(cal, d, '2026-11-30')[1]!.seances.find((x) => x.seance.type === 'C')!;
    expect(s2.seance.contenu.essais).toEqual(['F17']);
  });

  it('les décisions après un essai changent le statut : garde, refuse, réessaie', () => {
    const d = donnees();
    terminer(d, 1, 'C', { 'force:F17': { decision: 'refuse' } });
    expect(decisionsEssais(d)).toEqual({ statuts: { F17: 'exclu' }, reessais: [] });
    d.resultats[Object.keys(d.resultats)[0]!]!.exercices['force:F17'] = { decision: 'reessai' };
    expect(decisionsEssais(d)).toEqual({ statuts: {}, reessais: ['F17'] });
  });
});

describe('saisie préremplie', () => {
  it('force : une ligne par série, avec les répétitions prévues et la dernière charge utilisée', () => {
    const d = donnees();
    const b = terminer(d, 1, 'B', { 'force:F9': { series: [{ reps: 8, charge: 12 }, { reps: 8, charge: 14 }], unite: 'kg' } });
    const f9 = b.contenu.blocs.find((x) => x.type === 'force')!.exercices.find((p) => p.id === 'F9')!;
    const charge = derniereCharge(d, 'F9', '2026-12-31');
    expect(charge).toEqual({ charge: 14, unite: 'kg' });
    expect(preremplir('force', f9, charge)).toEqual({ series: [1, 2, 3].map(() => ({ reps: 8, charge: 14 })), unite: 'kg' });
  });

  it('sprints, sauts, course : le nombre ou la durée prévus', () => {
    const s = calculerSaison(cal, donnees(), '2026-11-20')[1]!.seances;
    const b = s.find((x) => x.seance.type === 'B')!.seance;
    const plio = b.contenu.blocs.find((x) => x.type === 'pliometrie')!.exercices[0]!;
    expect(preremplir('pliometrie', plio).nombre).toBe(plio.sauts);
    const c = s.find((x) => x.seance.type === 'C')!.seance;
    const course = c.contenu.blocs.find((x) => x.type === 'course')!.exercices[0]!;
    expect(preremplir('course', course)).toEqual({ minutes: 20 });
    expect(cleExercice('course', course)).toBe('course:E1');
  });

  it('demande les tibias et le genou après une course, les chevilles après des sauts', () => {
    const s = calculerSaison(cal, donnees(), '2026-11-20')[1]!.seances;
    expect(douleursDemandees(s.find((x) => x.seance.type === 'C')!.seance)).toEqual(['tibias', 'genou']);
    expect(douleursDemandees(s.find((x) => x.seance.type === 'B')!.seance)).toEqual(['chevilles']);
  });
});

describe('unités', () => {
  it('convertit les charges et affiche les deux unités', () => {
    expect(convertirCharge(60, 'kg', 'lb')).toBe(132.5);
    expect(convertirCharge(45, 'lb', 'kg')).toBe(20.5);
    expect(texteCharge(60, 'kg')).toBe('60 kg (132,5 lb)');
  });

  it('affiche l’allure en min/km, km/h ou mi/h', () => {
    expect(texteAllure(30, 5, 'min/km')).toBe('6:00 min/km');
    expect(texteAllure(30, 5, 'km/h')).toBe('10 km/h');
    expect(texteAllure(30, 5, 'mi/h')).toBe('6,2 mi/h');
  });

  it('calcule la distance du test de Cooper sur la piste de 460 m', () => {
    expect(distanceCooper(5, 120)).toBe(2420);
  });
});

describe('sauvegarde', () => {
  it('exporte puis réimporte les mêmes données', () => {
    const d = donnees();
    terminer(d, 1, 'B');
    const { nom, contenu } = creerSauvegarde(d, '2026-11-29');
    expect(nom).toBe('entrainement-lily-2026-11-29.json');
    expect(lireSauvegarde(contenu)).toEqual(d);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(() => lireSauvegarde('bonjour')).toThrow('ne se lit pas');
    expect(() => lireSauvegarde('{"a":1}')).toThrow("n'est pas une sauvegarde");
  });

  it('rappelle d’exporter après 7 jours', () => {
    const d = donnees();
    expect(rappelSauvegarde(d, '2026-11-30')).toBe(false); // rien à sauvegarder
    terminer(d, 1, 'B');
    expect(rappelSauvegarde(d, '2026-11-30')).toBe(true);
    d.preferences.derniereSauvegarde = '2026-11-27';
    expect(rappelSauvegarde(d, '2026-11-30')).toBe(false);
    expect(rappelSauvegarde(d, '2026-12-04')).toBe(true);
  });
});
