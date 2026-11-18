import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { calculerSaison } from '../stockage/saison';
import { texteCommentaires } from '../stockage/commentaires';
import { etatDuPlan } from '../stockage/suivi';
import { DONNEES_VIDES } from '../stockage/types';
import { genererCalendrier } from './calendrier';
import { joursEntre } from './dates';
import { chargePrevue, cran, maximumEstime } from './progression';
import { appliquerMarques, creerProgramme, marquesDe, reponsesDe, restrictionsDeSante } from './programme';

describe('blessures : la date « à 100 % » fixe les restrictions (décision du 18 novembre 2026)', () => {
  it('chevilles → changements de direction, tibias → sprint à 80 %, jusqu’à la veille', () => {
    expect(
      restrictionsDeSante({ chevilles: { etat: 'reeducation', centPourCentLe: '2027-01-01' }, tibias: { etat: 'sensible', centPourCentLe: '2026-12-01' } }, '2026-11-23'),
    ).toEqual({ sprint: { intensiteMax: 80, jusquau: '2026-11-30' }, changementsDeDirectionJusquau: '2026-12-31' });
  });

  it('tout va bien : aucune restriction', () => {
    expect(restrictionsDeSante({ chevilles: { etat: 'ok' }, genoux: { etat: 'sensible' } }, '2026-11-23')).toEqual({});
  });

  it('la saison 2026-2027 garde exactement ses restrictions validées', () => {
    expect(creerProgramme(reponsesDe(SAISON_2026_2027), SAISON_2026_2027).restrictions).toEqual(SAISON_2026_2027.restrictions);
  });

  it('sans aucune blessure, sprint à 100 % et changements de direction dès le début', () => {
    const r = { ...reponsesDe(SAISON_2026_2027), sante: {} };
    const config = creerProgramme(r, SAISON_2026_2027);
    expect(config.restrictions).toEqual({});
    expect(config.retests[0]).toEqual({ type: 'journee1', moment: 'semaine', semaine: 1 });
  });
});

describe('calendrier à colorier', () => {
  it('les jours marqués deviennent tournois, périodes plus mollo, frisbee et jours indisponibles', () => {
    const r = { ...reponsesDe(SAISON_2026_2027), tournois: [], periodesAllegees: [], matchsPonctuels: [], indisponibles: [] };
    const marques = {
      '2027-02-13': 'tournoi',
      '2027-02-14': 'tournoi',
      '2026-12-21': 'mollo',
      '2026-12-22': 'mollo',
      '2026-12-24': 'mollo',
      '2026-12-02': 'frisbee',
      '2026-12-05': 'indispo',
    } as const;
    const a = appliquerMarques(r, marques);
    expect(a.tournois).toEqual([{ debut: '2027-02-13', fin: '2027-02-14', nom: 'Tournoi du 13 févr.' }]);
    expect(a.periodesAllegees.map((p) => [p.debut, p.fin])).toEqual([
      ['2026-12-21', '2026-12-22'],
      ['2026-12-24', '2026-12-24'],
    ]);
    expect(a.matchsPonctuels).toEqual([{ date: '2026-12-02', nom: 'Frisbee' }]);
    expect(a.indisponibles).toEqual(['2026-12-05']);
    expect(marquesDe(a)).toEqual(marques);
  });

  it('garde le nom des tournois existants', () => {
    const r = reponsesDe(SAISON_2026_2027);
    expect(appliquerMarques(r, marquesDe(r)).tournois.map((t) => t.nom)).toEqual(SAISON_2026_2027.tournois.map((t) => t.nom));
  });

  it('un jour de frisbee ponctuel entre dans la semaine comme un match', () => {
    const config = { ...SAISON_2026_2027, matchsPonctuels: [{ date: '2026-12-02', nom: 'Frisbee' }] };
    const cal = genererCalendrier(config);
    expect(cal.semaines[1]!.evenements.filter((e) => e.type === 'match').map((e) => e.date)).toEqual(['2026-12-02']);
  });
});

describe('objectifs de départ', () => {
  const config = {
    ...SAISON_2026_2027,
    niveau: { ...SAISON_2026_2027.niveau!, chargesActuelles: { F1: { charge: 40, reps: 8, unite: 'kg' as const }, F9: { charge: 10, reps: 10, unite: 'kg' as const } } },
  };
  const cal = genererCalendrier(config);
  const d = structuredClone(DONNEES_VIDES);
  d.choix[1] = { nbSeances: 3, joursDisponibles: joursEntre(cal.semaines[0]!.debut, cal.semaines[0]!.fin) };
  const b = calculerSaison(cal, d, '2026-11-20')[0]!.seances.find((s) => s.seance.type === 'B')!.seance;
  const p = (id: string) => b.contenu.blocs.find((x) => x.type === 'force')!.exercices.find((e) => e.id === id)!;

  it('la charge actuelle donne un maximum estimé avant les tests (2 répétitions en réserve)', () => {
    expect(maximumEstime(cal, d, 'F1', b.date)).toBeCloseTo(40 * (1 + 10 / 30));
  });

  it('mouvement testé : % du maximum tiré de la charge actuelle ; autre exercice : objectif pour ses répétitions', () => {
    // 53,3 × 70 % × 0,95 = 35,5 → 35 kg.
    expect(chargePrevue(cal, d, b.date, 'fondation', p('F1'))?.charge).toBe(35);
    // F9 : 10 × (1 + 12 ÷ 30) = 14 → pour 8 répétitions et 2 en réserve : 10,5 → 10 kg (haltères, 2 kg).
    expect(chargePrevue(cal, d, b.date, 'fondation', p('F9'))).toMatchObject({ charge: 10, explication: expect.stringContaining('charge actuelle') });
  });

  it('allures connues : objectif en min/km avant le premier test demi-Cooper', () => {
    const c = calculerSaison(cal, d, '2026-11-20')[0]!.seances.find((s) => s.seance.type === 'C')!.seance;
    const course = c.contenu.blocs.find((x) => x.type === 'course')!.exercices[0]!;
    expect(course.allureEstimee).toBe(true);
    expect(course.vitesseKmh?.min).toBeCloseTo(10); // 6:00/km
  });
});

describe('poids disponibles : une seule unité à entrer', () => {
  it('l’autre unité est calculée et arrondie au demi', () => {
    const d = structuredClone(DONNEES_VIDES);
    d.preferences.crans = { halteres: { kg: 2 } };
    expect(cran('F7', 'kg', d)).toBe(2);
    expect(cran('F7', 'lb', d)).toBe(4.5);
    d.preferences.crans = { barre: { lb: 5 } };
    expect(cran('F1', 'kg', d)).toBe(2.5);
  });
});

describe('commentaires et plan', () => {
  it('les ressentis et notes sur les exercices se copient en texte pour Claude', () => {
    const cal = genererCalendrier(SAISON_2026_2027);
    const d = structuredClone(DONNEES_VIDES);
    d.choix[1] = { nbSeances: 3, joursDisponibles: joursEntre(cal.semaines[0]!.debut, cal.semaines[0]!.fin) };
    const b = calculerSaison(cal, d, '2026-11-20')[0]!.seances.find((s) => s.seance.type === 'B')!.seance;
    d.resultats[b.date] = {
      date: b.date,
      semaine: 1,
      seance: b,
      exercices: { 'force:F9': { series: [{ reps: 8, charge: 10 }], unite: 'kg', avis: { ressenti: 'trop-dur', commentaire: 'Équilibre difficile' } } },
      terminee: true,
      modifieLe: b.date,
      effort: 7,
    };
    const texte = texteCommentaires('Saison', d);
    expect(texte).toContain('ressenti : trop dur');
    expect(texte).toContain('« Équilibre difficile »');
    const plan = etatDuPlan(calculerSaison(cal, d, '2026-11-28'), d, '2026-11-28', cal.config.echeance);
    expect(plan).toMatchObject({ semaine: 1, seancesFaites: 1, tonnage: 160 });
  });
});
