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
    expect(preremplir('force', f9, charge)).toEqual({ series: [1, 2, 3].map(() => ({ reps: 8, charge: 14 })), unite: 'kg', prevu: { reps: 8, charge: 14 } });
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

  it('calcule la distance du test demi-Cooper sur la piste de 460 m', () => {
    expect(distanceCooper(5, 120)).toBe(2420);
  });
});

describe('sauvegarde', () => {
  it('exporte puis réimporte les mêmes données', () => {
    const d = donnees();
    terminer(d, 1, 'B');
    const s = { programmes: [{ meta: { id: 'p1', nom: 'Saison', creeLe: '2026-11-18' }, donnees: d }], actif: 'p1', preferences: d.preferences, statuts: d.statuts };
    const { nom, contenu } = creerSauvegarde(s, '2026-11-29');
    expect(nom).toBe('entrainement-lily-2026-11-29.json');
    expect(lireSauvegarde(contenu)).toEqual(s);
  });

  it('garde plusieurs programmes, chacun avec ses résultats', () => {
    const a = donnees();
    terminer(a, 1, 'B');
    const b = donnees();
    const s = {
      programmes: [
        { meta: { id: 'p1', nom: 'Hiver', creeLe: '2026-11-18' }, donnees: a },
        { meta: { id: 'p2', nom: 'Été', creeLe: '2027-04-01' }, donnees: b },
      ],
      actif: 'p2',
      preferences: a.preferences,
      statuts: a.statuts,
    };
    const lu = lireSauvegarde(creerSauvegarde(s, '2027-04-02').contenu);
    expect(lu.programmes.map((p) => p.meta.nom)).toEqual(['Hiver', 'Été']);
    expect(Object.keys(lu.programmes[0]!.donnees.resultats)).toHaveLength(1);
    expect(lu.actif).toBe('p2');
  });

  it('lit encore une sauvegarde de la version 1 (un seul programme)', () => {
    const d = donnees();
    terminer(d, 1, 'B');
    const v1 = JSON.stringify({ format: 'entrainement-lily', version: 1, exporteLe: '2026-11-29', donnees: d });
    const lu = lireSauvegarde(v1);
    expect(lu.programmes).toHaveLength(1);
    expect(lu.programmes[0]!.donnees.programme?.nom).toBe('Saison 2026-2027');
    expect(Object.keys(lu.programmes[0]!.donnees.resultats)).toHaveLength(1);
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

describe('matchs, tournois et semaine changée en cours de route (section 4)', () => {
  it('un match régulier ajouté (ligue du jeudi) entre dans le plan et les coupes à 2 matchs', () => {
    const d = { ...donnees(), choix: { 8: { nbSeances: 3, joursDisponibles: jours(8) } } };
    d.saison = { matchsReguliers: [{ nom: 'Ligue du jeudi', jour: 4, debut: '2027-01-14' }], tournois: [] };
    const s8 = calculerSaison(cal, d, '2027-01-10')[7]!;
    expect(s8.plan!.matchs.map((m) => m.date)).toEqual(['2027-01-13', '2027-01-14']);
    expect(s8.messages).toContain('2 matchs ou plus cette semaine : ajoute 1 routine de prévention de 10 min à la maison (M1, M7, M3).');
  });

  it('un tournoi ajouté rend la semaine « semaine de tournoi », avec la récupération après', () => {
    const d = { ...donnees(), choix: {} };
    d.saison = { matchsReguliers: [], tournois: [{ nom: 'Tournoi de décembre', debut: '2026-12-12', fin: '2026-12-13' }] };
    const s = calculerSaison(cal, d, '2026-11-20');
    expect(s[2]!.semaine.tournoi).toBe(true);
    expect(s[3]!.semaine.joursRecuperation).toEqual(['2026-12-14', '2026-12-15']);
  });

  it('semaine changée en cours de route : la séance faite reste, les autres sont replacées après', () => {
    const d = donnees();
    const a = terminer(d, 1, 'A');
    d.choix[1] = { nbSeances: 2, joursDisponibles: jours(1), depuis: '2026-11-25' };
    const s1 = calculerSaison(cal, d, '2026-11-25')[0]!;
    expect(s1.seances.map((s) => `${s.seance.date} ${s.seance.type}`)).toEqual([`${a.date} A`, ...s1.seances.slice(1).map((s) => `${s.seance.date} ${s.seance.type}`)]);
    expect(s1.seances).toHaveLength(2);
    expect(s1.seances[1]!.seance.date >= '2026-11-25').toBe(true);
  });

  it('la sauvegarde garde les matchs ajoutés et les notes de match', () => {
    const d = donnees();
    d.saison.matchsReguliers.push({ nom: 'Ligue du jeudi', jour: 4, debut: '2027-01-14' });
    d.notesMatchs['2027-01-13'] = 7;
    const s = { programmes: [{ meta: { id: 'p1', nom: 'Saison', creeLe: '' }, donnees: d }], preferences: d.preferences, statuts: d.statuts };
    expect(lireSauvegarde(creerSauvegarde(s, '2027-01-14').contenu).programmes[0]!.donnees).toEqual(d);
  });
});
