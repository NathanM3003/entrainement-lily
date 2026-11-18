import { describe, expect, it } from 'vitest';
import { exercice, exercices } from '../donnees/banque';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from './calendrier';
import { detaillerSemaine, texteDosage, type EtatContenu, type SeanceDetaillee } from './contenu';
import { joursEntre } from './dates';
import { dateDeblocage } from './restrictions';
import { planifierSemaine, type ChoixSemaine, type SeancesPrecedentes } from './semaine';

const cal = genererCalendrier(SAISON_2026_2027);
const semaine = (n: number) => cal.semaines[n - 1]!;
const tousLesJours = (n: number) => joursEntre(semaine(n).debut, semaine(n).fin);

/** Détaille une semaine, avec tous les jours disponibles par défaut. */
function detailler(n: number, choix: Partial<ChoixSemaine> = {}, etat: EtatContenu = {}, precedentes: SeancesPrecedentes = []) {
  const plan = planifierSemaine(cal, n, { nbSeances: 3, joursDisponibles: tousLesJours(n), ...choix }, precedentes);
  return detaillerSemaine(cal, plan, etat);
}

/** Toute la saison, semaine après semaine, en comptant les essais comme faits. */
function saison(nbSeances: number, etat: EtatContenu = {}): SeanceDetaillee[] {
  const toutes: SeanceDetaillee[] = [];
  const essais: Record<string, number> = { ...etat.essais };
  let precedentes: SeancesPrecedentes = [];
  for (const s of cal.semaines) {
    const plan = planifierSemaine(cal, s.numero, { nbSeances, joursDisponibles: tousLesJours(s.numero) }, precedentes, [], true);
    precedentes = plan.seances;
    const d = detaillerSemaine(cal, plan, { ...etat, essais: { ...essais } });
    for (const id of d.essaisPrevus) essais[id] = (essais[id] ?? 0) + 1;
    toutes.push(...d.seances);
  }
  return toutes;
}

const SAISONS = [1, 2, 3, 4].map((n) => ({ n, seances: saison(n) }));
const ids = (s: SeanceDetaillee) => s.contenu.blocs.flatMap((b) => b.exercices.map((p) => p.id));
const idsHorsEchauffement = (s: SeanceDetaillee) => s.contenu.blocs.filter((b) => b.type !== 'echauffement').flatMap((b) => b.exercices.map((p) => p.id));
const prescription = (s: SeanceDetaillee, id: string) => s.contenu.blocs.flatMap((b) => b.exercices).find((p) => p.id === id);
const blocs = (s: SeanceDetaillee) => s.contenu.blocs.map((b) => b.type);

describe('règles valables pour toute la saison (1 à 4 séances par semaine)', () => {
  it('ne programme jamais un exercice exclu, ni F5 (exercice de réserve)', () => {
    const exclus = new Set(exercices.filter((e) => e.statut === 'exclu').map((e) => e.id));
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        for (const id of ids(s)) {
          expect(exclus.has(id), `${s.date} : ${id}`).toBe(false);
          expect(id).not.toBe('F5');
        }
      }
    }
  });

  it('respecte les dates « Dès » : rien avant le 1er décembre ou le 1er janvier', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        for (const id of ids(s).filter((i) => !i.startsWith('T-'))) {
          const des = dateDeblocage(exercice(id), SAISON_2026_2027);
          expect(des !== null && s.date >= des, `${s.date} : ${id} (dès ${des})`).toBe(true);
        }
      }
    }
  });

  it('ne programme un exercice « à essayer » que comme essai, avec son remplacement affiché', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        for (const p of s.contenu.blocs.flatMap((b) => b.exercices)) {
          if (p.id.startsWith('T-') || p.role === 'echauffement') continue;
          if (exercice(p.id).statut === 'a-essayer') {
            expect(p.essai, `${s.date} : ${p.id}`).toBeDefined();
            expect(p.essai?.remplacement).toBeTruthy();
          }
        }
      }
    }
  });

  it('tient dans 1 h 30, ou environ 1 h en période allégée', () => {
    for (const { n, seances } of SAISONS) {
      for (const s of seances) {
        const limite = s.dureeMax < 90 ? s.dureeMax + 5 : 90;
        expect(s.contenu.minutes, `${n} séances, ${s.date} ${s.type}`).toBeLessThanOrEqual(limite);
      }
    }
  });

  it('applique la prévention minimale : M1 partout, M7 et M8 avec la course, M10 dans B', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        const prev = s.contenu.blocs.find((b) => b.type === 'prevention')?.exercices.map((p) => p.id) ?? [];
        // Le test du mollet de la journée 1 est le mouvement de M1 poussé au maximum.
        // Les tests du mollet (journée 1, mini-retest) sont le mouvement de M1 poussé au maximum.
        if (!ids(s).includes('T-mollet')) expect(prev, `${s.date} ${s.type}`).toContain('M1');
        if (s.contenu.course) expect(prev, `${s.date} ${s.type}`).toEqual(expect.arrayContaining(['M7', 'M8']));
        else expect(prev.some((id) => id === 'M7' || id === 'M8'), `${s.date} ${s.type} sans course`).toBe(false);
        if (s.type === 'B' && !s.test) expect(prev, `${s.date} B`).toContain('M10');
      }
    }
  });

  it('suit l’ordre de la section 2 : échauffement, fraîcheur, force, course facile, prévention', () => {
    const rang = (t: string) => ['echauffement', 'agilite', 'tests', 'vitesse', 'pliometrie', 'intermittents', 'force', 'course', 'cardio', 'essai', 'mobilite', 'prevention'].indexOf(t);
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        const r = blocs(s).map(rang);
        expect(r, `${s.date}`).toEqual([...r].sort((a, b) => a - b));
        expect(blocs(s)[0]).toBe('echauffement');
        // La journée 1 sans sprint finit par le test du mollet (pas de course, M1 poussé au maximum).
        expect(blocs(s).at(-1)).toBe(s.test === 'journee1' && !s.contenu.course ? 'tests' : 'prevention');
      }
    }
  });

  it('met au plus 1 exercice à essayer par séance (sauf le bloc de S8, voir plus bas)', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances.filter((x) => x.contenu.blocs.every((b) => b.type !== 'agilite'))) {
        expect(s.contenu.essais.length, s.date).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ne met jamais de course dans la séance D', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances.filter((x) => x.type === 'D')) {
        expect(s.contenu.course, s.date).toBe(false);
        expect(ids(s).some((id) => ['E1', 'E2', 'E5', 'E6', 'E7', 'E8', 'E11', 'E12'].includes(id))).toBe(false);
      }
    }
  });

  it('garde les exercices principaux (F1, F7, F9, F10, F14, F16) toute la phase', () => {
    const seances = SAISONS.find((x) => x.n === 3)!.seances;
    const fondationB = seances.filter((s) => s.type === 'B' && semaineDe(s.date)?.phase === 'fondation');
    for (const s of fondationB) expect(idsHorsEchauffement(s), s.date).toEqual(expect.arrayContaining(['F1', 'F7', 'F9', 'F10']));
    const fondationC = seances.filter((s) => s.type === 'C' && semaineDe(s.date)?.phase === 'fondation');
    for (const s of fondationC) expect(idsHorsEchauffement(s), s.date).toEqual(expect.arrayContaining(['F14', 'F16']));
  });
});

const semaineDe = (date: string) => cal.semaines.find((s) => date >= s.debut && date <= s.fin);

describe('modèles de la section 7', () => {
  it('Fondation A : 2 éducatifs, accélérations V5, V6 ou V7 (4 à 8), A1, course facile selon l’étape', () => {
    const a = detailler(3).seances.find((s) => s.type === 'A')!;
    const vitesse = a.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices;
    expect(vitesse.filter((p) => p.role === 'educatif')).toHaveLength(2);
    const acc = vitesse.find((p) => p.role === 'acceleration')!;
    expect(['V5', 'V6', 'V7']).toContain(acc.id);
    expect(acc.reps).toEqual({ min: 4, max: 8 });
    expect(vitesse.find((p) => p.id === 'A1')?.reps).toEqual({ min: 4, max: 4 });
    const course = a.contenu.blocs.find((b) => b.type === 'course')!.exercices[0]!;
    expect(texteDosage(course)).toBe('Étape 1 : 5 × (3 min de course + 1 min de marche)');
    const a5 = detailler(3, {}, { etapeCourse: 5 }).seances.find((s) => s.type === 'A')!;
    expect(a5.contenu.blocs.find((b) => b.type === 'course')!.exercices[0]).toMatchObject({ id: 'E2', format: 'Étape 5 : 20 min en continu' });
  });

  it('Fondation B : pliométrie de 40 à 60 sauts avec A2, puis F1, F7, F9, F10 et A3 à 70 % pour F1 et F7', () => {
    for (const n of [2, 3, 4]) {
      const b = detailler(n).seances.find((s) => s.type === 'B')!;
      expect(b.contenu.sauts, `S${n}`).toBeGreaterThanOrEqual(40);
      expect(b.contenu.sauts, `S${n}`).toBeLessThanOrEqual(60);
      const plio = b.contenu.blocs.find((x) => x.type === 'pliometrie')!.exercices.map((p) => p.id);
      expect(['P1', 'P3']).toContain(plio[0]);
      expect(plio).toContain('A2');
      expect(idsHorsEchauffement(b)).toEqual(expect.arrayContaining(['F1', 'F7', 'F9', 'F10', 'A3']));
      expect(prescription(b, 'F1')).toMatchObject({ series: 3, reps: { min: 8, max: 10 }, pourcentage1RM: 70, derniereSeriePlus: true });
    }
  });

  it('Fondation C : F14, F16, F13 ou F17, F18, 2 exercices de tronc, course facile', () => {
    const c = detailler(4).seances.find((s) => s.type === 'C')!;
    const force = c.contenu.blocs.find((b) => b.type === 'force')!.exercices.map((p) => p.id);
    expect(force.slice(0, 2)).toEqual(['F14', 'F16']);
    expect(force).toContain('F18');
    expect(force.filter((id) => ['F19', 'F20', 'F21', 'F22', 'F23'].includes(id))).toHaveLength(2);
    expect(blocs(c)).toContain('course');
  });

  it('Puissance A : V9 ou V11, V6, puis F25 en premier, F1 à 85 %, F26 et F10', () => {
    const a = detailler(13).seances.find((s) => s.type === 'A')!;
    const force = a.contenu.blocs.find((b) => b.type === 'force')!.exercices;
    expect(force.map((p) => p.id)).toEqual(['F25', 'F1', 'F26', 'F10']);
    expect(force[1]).toMatchObject({ series: 3, reps: { min: 3, max: 5 }, pourcentage1RM: 85 });
    const vitesse = a.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.map((p) => p.id);
    expect(vitesse).toContain('V6');
    expect(vitesse.some((id) => id === 'V9' || id === 'V11')).toBe(true);
  });

  it('Puissance B : pliométrie de côté (P14 ou P15) plus P10, P11 ou P12 ; prévention M1, M10, M11', () => {
    const b = detailler(13).seances.find((s) => s.type === 'B')!;
    const plio = b.contenu.blocs.find((x) => x.type === 'pliometrie')!.exercices.map((p) => p.id);
    expect(['P14', 'P15']).toContain(plio[0]);
    expect(['P10', 'P11', 'P12']).toContain(plio[1]);
    expect(b.contenu.blocs.find((x) => x.type === 'prevention')!.exercices.map((p) => p.id)).toEqual(['M1', 'M10', 'M11']);
  });

  it('D : haut du corps et tronc, cardio sans impact E10 tant que E3 n’est pas adopté, E3 continu s’il l’est', () => {
    const d = detailler(4, { nbSeances: 4 }).seances.find((s) => s.type === 'D')!;
    expect(ids(d)).toContain('E10');
    const adopte = detailler(4, { nbSeances: 4 }, { statuts: { E3: 'valide' } }).seances.find((s) => s.type === 'D')!;
    expect(prescription(adopte, 'E3')).toMatchObject({ role: 'cardio', minutes: 20 });
  });

  it('intermittents de la phase 2 : jamais le même format deux semaines de suite', () => {
    const formats = [6, 8].map((n) => detailler(n, { nbSeances: 4 }).seances.find((s) => s.type === 'C' && !s.test))
      .map((s) => s?.contenu.blocs.find((b) => b.type === 'intermittents')?.exercices[0]?.id);
    expect(formats[0]).toBeDefined();
    expect(formats[0]).not.toBe(formats[1]);
  });
});

describe('rotation', () => {
  it('les éducatifs changent chaque semaine', () => {
    const educ = (n: number) =>
      detailler(n)
        .seances.find((s) => s.type === 'A' && !s.test)!
        .contenu.blocs.find((b) => b.type === 'vitesse')!
        .exercices.filter((p) => p.role === 'educatif')
        .map((p) => p.id);
    expect(educ(3)).not.toEqual(educ(4));
  });

  it('le tronc alterne toutes les 2 semaines', () => {
    const tronc = (n: number) =>
      idsHorsEchauffement(detailler(n, { nbSeances: 4 }).seances.find((s) => s.type === 'D')!).filter((id) => /^F(19|2[0-3])$/.test(id));
    // S11 et S12 forment un bloc de 2 semaines, S13 et S14 le suivant (S12, semaine de tournoi, n'a pas de D).
    expect(tronc(13)).toEqual(tronc(14));
    expect(tronc(13)).not.toEqual(tronc(11));
  });

  it('aucune rotation en semaine légère : mêmes exercices que la semaine normale d’avant, 1 série de moins', () => {
    // S6 (normale) puis S7 (légère, vacances) : la séance B garde sa pliométrie.
    const b6 = detailler(6, { nbSeances: 2 }).seances.find((s) => s.type === 'B')!;
    const b7 = detailler(7, { nbSeances: 2 }).seances.find((s) => s.type === 'B')!;
    const plio = (s: SeanceDetaillee) => s.contenu.blocs.find((b) => b.type === 'pliometrie')!.exercices.map((p) => p.id);
    expect(plio(b7)).toEqual(plio(b6));
    expect(prescription(b7, 'F7')?.series).toBe(prescription(b6, 'F7')!.series! - 1);
    expect(prescription(b7, 'F7')?.pourcentage1RM).toBe(80); // mêmes charges
    expect(b7.contenu.messages).toContain('Semaine légère : 1 série de moins, moins de sprints et de sauts, mêmes charges.');
  });
});

describe('exercices « à essayer » (section 6)', () => {
  it('F17, F21, F23 et M20 sont essayés dans les séances C et D de S1 à S3, un par séance', () => {
    const quatre = SAISONS.find((x) => x.n === 4)!.seances;
    const essais = quatre.filter((s) => s.contenu.essais.length).map((s) => `${semaineDe(s.date)!.numero} ${s.type} ${s.contenu.essais.join(',')}`);
    expect(essais.slice(0, 4)).toEqual(['1 C F17', '1 D F21', '2 C F23', '2 D M20']);
  });

  it('avec 3 séances, il n’y a que 3 séances C de S1 à S3 : M20 n’est pas essayé', () => {
    const trois = SAISONS.find((x) => x.n === 3)!.seances;
    const tous = trois.flatMap((s) => s.contenu.essais);
    expect(tous.filter((id) => ['F17', 'F21', 'F23', 'M20'].includes(id))).toEqual(['F17', 'F21', 'F23']);
  });

  it('un exercice gardé entre dans la rotation, un exercice refusé laisse la place à son remplacement', () => {
    const garde = detailler(4, { nbSeances: 4 }, { statuts: { F17: 'valide' } });
    const d = garde.seances.find((s) => s.type === 'D')!;
    expect(idsHorsEchauffement(d).some((id) => id === 'F16' || id === 'F17')).toBe(true);
    const refuse = saison(4, { statuts: { F21: 'exclu' } });
    expect(refuse.some((s) => ids(s).includes('F21'))).toBe(false);
  });

  it('« Je réessaie une fois » : l’exercice revient une deuxième fois', () => {
    const d = detailler(4, { nbSeances: 4 }, { essais: { F17: 1, F21: 1, F23: 1, M20: 1 }, reessais: ['F21'] });
    expect(d.essaisPrevus).toContain('F21');
  });

  it('aucun essai en semaine légère ni pendant l’affûtage', () => {
    for (const { seances } of SAISONS) {
      for (const s of seances) {
        const sem = semaineDe(s.date)!;
        const hors = sem.legere?.etendue === 'complete' || sem.phase === 'affutage';
        if (hors) expect(s.contenu.essais, s.date).toEqual([]);
      }
    }
  });

  it('E3 : essayé une fois en Fondation, 10 min à la fin d’une séance C', () => {
    const d = detailler(4, {}, { essais: { F17: 1, F21: 1, F23: 1, M20: 1 } });
    const c = d.seances.find((s) => s.type === 'C')!;
    expect(c.contenu.essais).toEqual(['E3']);
    expect(c.contenu.blocs.find((b) => b.type === 'essai')?.exercices[0]).toMatchObject({ id: 'E3', minutes: 10 });
    expect(blocs(c).indexOf('essai')).toBeGreaterThan(blocs(c).indexOf('course'));
  });

  it('S8 : A8 et A9 sont essayés dans le bloc de changements de direction de la séance B', () => {
    const b = detailler(8).seances.find((s) => s.type === 'B')!;
    const bloc = b.contenu.blocs.find((x) => x.type === 'agilite')!.exercices;
    expect(bloc.map((p) => p.id)).toEqual(['A4', 'A9', 'P15', 'A8']);
    expect(b.contenu.essais).toEqual(['A9', 'A8']);
    expect(bloc.find((p) => p.id === 'A8')?.intensite).toBe(70);
  });
});

describe('restrictions datées (section 3)', () => {
  it('S1 : chaque exercice de vitesse affiche 80 %', () => {
    const d = detailler(1, { nbSeances: 4 });
    for (const s of d.seances) {
      for (const p of s.contenu.blocs.flatMap((b) => b.exercices)) {
        if (!p.id.startsWith('T-') && exercice(p.id).type === 'vitesse') expect(p.intensite, `${s.date} ${p.id}`).toBe(80);
      }
    }
  });

  it('pas de vitesse maximale (V9, V11) en Fondation, même après le 1er décembre', () => {
    for (const n of [2, 3, 4]) {
      for (const s of detailler(n, { nbSeances: 4 }).seances) expect(ids(s).some((id) => id === 'V9' || id === 'V11')).toBe(false);
    }
  });

  it('changements de direction : latéral contrôlé du 1er au 10 janvier, dans les séances de la semaine', () => {
    const s7 = detailler(7, { nbSeances: 2 });
    for (const s of s7.seances) {
      expect(s.contenu.blocs.find((b) => b.type === 'agilite')?.exercices.map((p) => p.id)).toEqual(['A12', 'A4', 'P14']);
    }
    // S6 : rien avant le 1er janvier.
    const s6 = detailler(6, { nbSeances: 3 });
    for (const s of s6.seances.filter((x) => x.date < '2027-01-01')) expect(blocs(s)).not.toContain('agilite');
  });

  it('S9 : coupe de handler (A8) à 85-90 % dans la séance B si A8 est gardée, sinon pas chassés rapides', () => {
    // S9 en 3 séances ne contient pas de B (tournoi). On regarde le bloc avec un plan qui met B le lundi.
    const plan = planifierSemaine(cal, 9, { nbSeances: 2, joursDisponibles: ['2027-01-18'] });
    const avecB = { ...plan, seances: plan.seances.map((s) => ({ ...s, type: 'B' as const })) };
    const garde = detaillerSemaine(cal, avecB, { statuts: { A8: 'valide' } }).seances[0]!;
    expect(garde.contenu.blocs.find((b) => b.type === 'agilite')?.exercices[0]).toMatchObject({ id: 'A8', intensite: 90 });
    const pasGarde = detaillerSemaine(cal, avecB).seances[0]!;
    expect(pasGarde.contenu.blocs.find((b) => b.type === 'agilite')?.exercices[0]?.id).toBe('A4');
  });

  it('à partir de février, pas de bloc de changements de direction les semaines avec un match', () => {
    for (const n of [11, 13, 14]) {
      for (const s of detailler(n, { nbSeances: 4 }).seances) expect(blocs(s), `S${n} ${s.date}`).not.toContain('agilite');
    }
    const sansMatch = detailler(13, { nbSeances: 3, matchsAnnules: ['2027-02-17'] }).seances.find((s) => s.type === 'B')!;
    expect(blocs(sansMatch)).toContain('agilite');
  });
});

describe('matchs (section 4)', () => {
  it('1 match : intermittents réduits de moitié', () => {
    const c = detailler(8, { nbSeances: 4 }).seances.find((s) => s.type === 'C' && s.variante === 'normale')!;
    const inter = c.contenu.blocs.find((b) => b.type === 'intermittents')!.exercices[0]!;
    expect(inter.series ?? 1).toBe(1);
    expect(c.contenu.messages).toContain('1 match cette semaine : intermittents réduits de moitié.');
  });

  it('C le lendemain du match : intermittents sur vélo ou rameur (E10), sans M7 ni M8', () => {
    const p = detailler(8, { joursDisponibles: ['2027-01-11', '2027-01-14', '2027-01-16'] });
    const c = p.seances.find((s) => s.type === 'C')!;
    expect(c.variante).toBe('sans-course');
    expect(ids(c)).toContain('E10');
    expect(c.contenu.course).toBe(false);
  });

  it('2 matchs : accélérations seulement, un tiers en moins ; moitié des sauts sans rien de côté ; 1 série de moins en bas du corps', () => {
    const normal = detailler(13, { nbSeances: 3, matchsAnnules: ['2027-02-17'] });
    const deux = detailler(13, { nbSeances: 3, matchsSupplementaires: ['2027-02-18'] });
    const a = deux.seances.find((s) => s.type === 'A')!;
    expect(ids(a).some((id) => id === 'V9' || id === 'V11')).toBe(false);
    expect(prescription(a, 'V6')?.reps).toEqual({ min: 2, max: 3 });
    expect(prescription(a, 'F1')?.series).toBe(prescription(normal.seances.find((s) => s.type === 'A')!, 'F1')!.series! - 1);
    expect(deux.messages).toContain('2 matchs ou plus cette semaine : ajoute 1 routine de prévention de 10 min à la maison (M1, M7, M3).');
  });

  it('séance le jour du match : haut du corps et tronc seulement, sans course ni sauts', () => {
    const p = detailler(8, { joursDisponibles: ['2027-01-11', '2027-01-13', '2027-01-16'] });
    const jour = p.seances.find((s) => s.date === '2027-01-13')!;
    expect(jour.contenu.course).toBe(false);
    expect(jour.contenu.sauts).toBe(0);
    // Décision de Lily : du cardio très facile est permis, facultatif.
    expect(blocs(jour)).toEqual(['echauffement', 'force', 'cardio', 'prevention']);
    expect(ids(jour)).not.toContain('P1');
  });
});

describe('tests et affûtage', () => {
  it('S1 : journée 1 sans sprint, dans l’ordre du profil', () => {
    const t = detailler(1).seances.find((s) => s.test === 'journee1')!;
    expect(t.contenu.blocs.find((b) => b.type === 'tests')!.exercices.map((p) => p.id)).toEqual([
      'T-cheville',
      'T-saut',
      'T-F1',
      'T-F7',
      'T-F14',
      'T-F16',
      'T-mollet',
    ]);
    expect(t.contenu.minutes).toBeLessThanOrEqual(90);
  });

  it('S10 et S14 : journée 1 complète avec le saut sur une jambe et le sprint', () => {
    for (const n of [10, 14]) {
      const t = detailler(n).seances.find((s) => s.test === 'journee1')!;
      const tests = t.contenu.blocs.find((b) => b.type === 'tests')!.exercices.map((p) => p.id);
      expect(tests).toEqual(expect.arrayContaining(['T-saut-une-jambe', 'T-sprint-10', 'T-sprint-20']));
      expect(t.contenu.minutes).toBeLessThanOrEqual(90);
    }
  });

  it('S2 : le test de sprint remplace les accélérations de la séance A', () => {
    const a = detailler(2).seances.find((s) => s.test === 'sprint')!;
    expect(ids(a)).toEqual(expect.arrayContaining(['T-sprint-10', 'T-sprint-20']));
    expect(a.contenu.blocs.find((b) => b.type === 'vitesse')!.exercices.some((p) => p.role === 'acceleration')).toBe(false);
    expect(ids(a)).toEqual(expect.arrayContaining(['M7', 'M8']));
  });

  it('S11 : test demi-Cooper, puis le tronc et F18 de la séance C', () => {
    const c = detailler(11).seances.find((s) => s.test === 'cooper')!;
    expect(blocs(c)).toEqual(['echauffement', 'tests', 'force', 'prevention']);
    expect(ids(c)).toContain('F18');
    expect(c.contenu.course).toBe(true);
  });

  it('affûtage A : V6, V9, F1 en 2 ou 3 séries de 3 à sa charge lourde, F10 2 × 8', () => {
    const plan = planifierSemaine(cal, 16, { nbSeances: 1, joursDisponibles: ['2027-03-08'] });
    const avecA = { ...plan, seances: [{ ...plan.seances[0]!, type: 'A' as const, variante: 'normale' as const }] };
    const a = detaillerSemaine(cal, avecA).seances[0]!;
    expect(idsHorsEchauffement(a).filter((id) => !id.startsWith('M'))).toEqual(['V6', 'V9', 'F1', 'F10']);
    expect(texteDosage(prescription(a, 'F1')!)).toBe('2 ou 3 séries de 3');
    expect(prescription(a, 'F1')?.note).toBe('À sa charge lourde habituelle');
    expect(a.contenu.minutes).toBeLessThanOrEqual(65);
  });

  it('S15 et S16 : aucune séance chargée pour les jambes dans les 48 h avant le tournoi ou le début de la saison', () => {
    for (const n of [15, 16]) {
      for (const k of [1, 2, 3, 4]) {
        const d = detailler(n, { nbSeances: k });
        for (const s of d.seances.filter((x) => x.date >= (n === 15 ? '2027-03-04' : '2027-03-11'))) expect(s.charge, `S${n}`).toBe('faible');
      }
    }
  });
});

describe('affichage du dosage', () => {
  it('écrit le dosage en toutes lettres', () => {
    const b = detailler(3).seances.find((s) => s.type === 'B')!;
    expect(texteDosage(prescription(b, 'F7')!)).toBe('3 × 8 par côté');
    const c = detailler(8, { nbSeances: 4 }).seances.find((s) => s.type === 'C' && s.variante === 'normale')!;
    expect(texteDosage(c.contenu.blocs.find((x) => x.type === 'intermittents')!.exercices[0]!)).toMatch(/^\d/);
  });
});
