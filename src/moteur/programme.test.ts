import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { calculerSaison } from '../stockage/saison';
import { DONNEES_VIDES } from '../stockage/types';
import { genererCalendrier } from './calendrier';
import { joursEntre } from './dates';
import { creerProgramme, nombreSemaines, reponsesDe, retestsParDefaut, verifierReponses } from './programme';

describe('questionnaire de création (Règles, section 0)', () => {
  it('prérempli avec la saison 2026-2027 : le même programme, retests et semaine légère validés compris', () => {
    const r = reponsesDe(SAISON_2026_2027);
    expect(r).toMatchObject({ seancesParSemaine: 3, dureeMax: 90, etapeCourse: 1, sprint: { intensiteMax: 80, jusquau: '2026-11-30' } });
    expect(verifierReponses(r)).toEqual([]);
    const config = creerProgramme(r, SAISON_2026_2027);
    expect(config.retests).toEqual(SAISON_2026_2027.retests);
    expect(config.semainesLegeres).toEqual(SAISON_2026_2027.semainesLegeres);
    expect(genererCalendrier(config).semaines.map((s) => [s.phase, !!s.legere])).toEqual(
      genererCalendrier(SAISON_2026_2027).semaines.map((s) => [s.phase, !!s.legere]),
    );
  });

  it('la règle générale des retests retrouve le calendrier validé de 2026-2027 (sauf le mini-retest de Noël)', () => {
    const r = reponsesDe(SAISON_2026_2027);
    const generiques = retestsParDefaut(r).map((t) => `S${t.semaine} ${t.type} ${t.moment}${t.final ? ' final' : ''}`);
    expect(generiques).toEqual([
      'S1 journee1 semaine',
      'S2 sprint premiere-seance-a',
      'S4 cooper condition',
      'S5 journee1 fin',
      'S10 journee1 fin',
      'S11 cooper debut',
      'S14 journee1 fin final',
    ]);
  });

  it('autre saison de 12 semaines, sans restriction : un retest à la fin de chaque phase, rien pendant l’affûtage', () => {
    const r = {
      ...reponsesDe(SAISON_2026_2027),
      nom: 'Saison 2028',
      debut: '2027-10-04',
      echeance: '2027-12-27',
      sprint: undefined,
      changementsDeDirectionJusquau: undefined,
      tournois: [],
      periodesAllegees: [],
      matchsReguliers: [],
    };
    expect(nombreSemaines(r.debut, r.echeance)).toBe(12);
    const config = creerProgramme(r, SAISON_2026_2027);
    expect(config.semainesLegeres).toEqual([]);
    const cal = genererCalendrier(config);
    expect(cal.semaines.map((s) => s.phase).filter((p, i, t) => t.indexOf(p) === i)).toEqual(['fondation', 'force-vitesse', 'puissance-repetition', 'affutage']);
    const tests = config.retests.map((t) => `S${t.semaine} ${t.type}${t.avecSautUneJambe ? ' +1 jambe' : ''}${t.final ? ' final' : ''}`);
    expect(tests).toEqual(['S1 journee1', 'S3 cooper', 'S4 journee1 +1 jambe', 'S7 journee1 +1 jambe', 'S8 cooper', 'S10 journee1 +1 jambe final']);
    expect(cal.semaines.filter((s) => s.phase === 'affutage').every((s) => s.retests.length === 0)).toBe(true);
  });

  it('refuse des réponses impossibles, en phrases claires', () => {
    const r = reponsesDe(SAISON_2026_2027);
    expect(verifierReponses({ ...r, echeance: '2026-11-01' })).toContain("L'échéance doit être après le début du programme.");
    expect(verifierReponses({ ...r, tournois: [{ nom: 'X', debut: '2027-02-10', fin: '2027-02-09' }] })[0]).toMatch(/Tournoi « X »/);
  });

  it('la durée maximale et l’étape de course de départ choisies changent le plan', () => {
    const config = creerProgramme({ ...reponsesDe(SAISON_2026_2027), dureeMax: 60, etapeCourse: 4 }, SAISON_2026_2027);
    const cal = genererCalendrier(config);
    const d = structuredClone(DONNEES_VIDES);
    d.choix[3] = { nbSeances: 3, joursDisponibles: joursEntre(cal.semaines[2]!.debut, cal.semaines[2]!.fin) };
    const s3 = calculerSaison(cal, d, '2026-11-20')[2]!;
    expect(s3.seances.every((s) => s.seance.dureeMax === 60 && s.seance.contenu.minutes <= 65)).toBe(true);
    const course = s3.seances.flatMap((s) => s.seance.contenu.blocs).find((b) => b.type === 'course')!.exercices[0]!;
    expect(course.format).toMatch(/^Étape 4/);
  });

  it('un statut changé dans l’écran Exercices passe avant la banque', () => {
    const cal = genererCalendrier(SAISON_2026_2027);
    const d = structuredClone(DONNEES_VIDES);
    d.choix[4] = { nbSeances: 4, joursDisponibles: joursEntre(cal.semaines[3]!.debut, cal.semaines[3]!.fin) };
    d.statuts = { F19: 'exclu', F20: 'exclu', F22: 'exclu' };
    const ids = calculerSaison(cal, d, '2026-11-20')[3]!.seances.flatMap((s) => s.seance.contenu.blocs.flatMap((b) => b.exercices.map((p) => p.id)));
    expect(ids.some((id) => ['F19', 'F20', 'F22'].includes(id))).toBe(false);
  });
});
