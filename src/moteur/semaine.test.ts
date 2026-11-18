import { describe, expect, it } from 'vitest';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from './calendrier';
import { ajouterJours, joursEntre, type DateISO } from './dates';
import { planifierSemaine, type PlanSemaine } from './semaine';

const cal = genererCalendrier(SAISON_2026_2027);
const semaine = (n: number) => cal.semaines[n - 1]!;
const tousLesJours = (n: number) => joursEntre(semaine(n).debut, semaine(n).fin);

/** « 2027-01-11 A » pour chaque séance, dans l'ordre des jours. */
const resume = (p: PlanSemaine) => p.seances.map((s) => `${s.date} ${s.type}${s.variante === 'sans-course' ? ' sans course' : ''}`);

/** Vérifie les règles de placement de la section 3 sur un plan. */
function verifierRegles(p: PlanSemaine, joursMatch: DateISO[]) {
  const parDate = new Map(p.seances.map((s) => [s.date, s]));
  for (const s of p.seances) {
    const suivante = parDate.get(ajouterJours(s.date, 1));
    if (suivante) {
      expect(s.charge === 'elevee' && suivante.charge === 'elevee', `2 jours chargés : ${s.date}`).toBe(false);
      expect(s.course && suivante.course, `2 jours de course : ${s.date}`).toBe(false);
    }
    const presDUnMatch = [-1, 0, 1].some((d) => joursMatch.includes(ajouterJours(s.date, d)));
    if (presDUnMatch) expect(s.charge, `près d'un match : ${s.date}`).toBe('faible');
  }
}

// Règles, section 3, « Exemples ».
describe('exemples des Règles', () => {
  it('1 match le mercredi, 3 séances : lundi A, jeudi C sans course, samedi B', () => {
    // S8 : premier 4 contre 4 le mercredi 13 janvier.
    const p = planifierSemaine(cal, 8, { nbSeances: 3, joursDisponibles: ['2027-01-11', '2027-01-14', '2027-01-16'] });
    expect(resume(p)).toEqual(['2027-01-11 A', '2027-01-14 C sans course', '2027-01-16 B']);
    expect(p.messages).toContain('Séance C en version sans course (vélo ou rameur) : elle tombe le lendemain du match.');
  });

  it('2 matchs (mercredi et jeudi), 2 séances : lundi A, vendredi repos, samedi B', () => {
    const p = planifierSemaine(cal, 8, {
      nbSeances: 2,
      joursDisponibles: ['2027-01-11', '2027-01-15', '2027-01-16'],
      matchsSupplementaires: ['2027-01-14'],
    });
    expect(resume(p)).toEqual(['2027-01-11 A', '2027-01-16 B']);
  });
});

describe('placement des séances', () => {
  it('respecte les règles quand tous les jours sont disponibles', () => {
    for (let n = 1; n <= 16; n++) {
      for (let k = 1; k <= 4; k++) {
        const p = planifierSemaine(cal, n, { nbSeances: k, joursDisponibles: tousLesJours(n) });
        const joursMatch = cal.semaines.flatMap((s) => s.evenements).filter((e) => e.type === 'match' || e.type === 'tournoi');
        verifierRegles(
          p,
          joursMatch.map((e) => e.date),
        );
        expect(p.seances.length, `S${n}, ${k} séances`).toBeGreaterThan(0);
      }
    }
  });

  it('place A, B et C en Fondation sans match, avec 7 jours disponibles', () => {
    const p = planifierSemaine(cal, 3, { nbSeances: 3, joursDisponibles: tousLesJours(3) });
    expect(p.seances.map((s) => s.type).sort()).toEqual(['A', 'B', 'C']);
    expect(p.messages).toEqual([]);
  });

  it('utilise les séances de la colonne « 2 » en Fondation', () => {
    const p = planifierSemaine(cal, 3, { nbSeances: 2, joursDisponibles: tousLesJours(3) });
    expect(p.seances.map((s) => s.libelle)).toEqual(['Vitesse + course facile', 'Pliométrie + force complète']);
  });

  it('fait une séance unique « vitesse + force complète » quand Lily en choisit 1', () => {
    const p = planifierSemaine(cal, 4, { nbSeances: 1, joursDisponibles: ['2026-12-16'] });
    expect(p.seances).toMatchObject([{ type: 'U', libelle: 'Vitesse + force complète', date: '2026-12-16' }]);
  });

  it('réduit le nombre de séances quand il y a moins de jours que de séances, et le dit', () => {
    const p = planifierSemaine(cal, 3, { nbSeances: 4, joursDisponibles: ['2026-12-07', '2026-12-10'] });
    expect(p.seances).toHaveLength(2);
    expect(p.messages[0]).toBe("Tu as donné 2 jours pour 4 séances : l'app prévoit 2 séances.");
  });

  it('transforme C en version sans course plutôt que de la retirer', () => {
    // Trois jours de suite : C entre A et B ne peut pas courir (2 jours de course de suite).
    const p = planifierSemaine(cal, 3, { nbSeances: 3, joursDisponibles: ['2026-12-07', '2026-12-08', '2026-12-09'] });
    expect(resume(p)).toEqual(['2026-12-07 A', '2026-12-08 C sans course', '2026-12-09 B']);
    expect(p.messages).toEqual(['Séance C en version sans course (vélo ou rameur) : elle tombe à cause des jours choisis.']);
  });

  it('retire une séance quand les jours ne permettent pas de respecter les règles, et le dit', () => {
    // Deux jours de suite en Fondation : les 2 séances sont chargées, elles ne peuvent pas se suivre.
    const p = planifierSemaine(cal, 3, { nbSeances: 2, joursDisponibles: ['2026-12-07', '2026-12-08'] });
    expect(p.seances).toMatchObject([{ type: 'U' }]);
    expect(p.messages).toEqual([
      'Les jours choisis ne permettent que 1 séance en respectant les règles (matchs, repos, tibias) : une seule séance « vitesse + force complète » cette semaine.',
    ]);
  });

  it('ne met une séance le jour du match qu’en dernier recours, en charge faible', () => {
    const p = planifierSemaine(cal, 8, { nbSeances: 3, joursDisponibles: ['2027-01-11', '2027-01-13', '2027-01-16'] });
    expect(resume(p)).toEqual(['2027-01-11 A', '2027-01-13 C sans course', '2027-01-16 B']);
    expect(p.messages.some((m) => m.includes('le jour du match'))).toBe(true);
  });

  it('ne met jamais de séance le jour du match si un autre jour convient', () => {
    const p = planifierSemaine(cal, 8, { nbSeances: 3, joursDisponibles: tousLesJours(8) });
    expect(p.seances.some((s) => s.date === '2027-01-13')).toBe(false);
  });

  it('garde au moins 1 jour de repos complet', () => {
    const p = planifierSemaine(cal, 8, { nbSeances: 4, joursDisponibles: tousLesJours(8) });
    const actifs = new Set([...p.seances.map((s) => s.date), '2027-01-13']);
    expect(actifs.size).toBeLessThan(7);
  });

  it('évite de finir la semaine par une course', () => {
    for (const n of [3, 8, 11]) {
      const p = planifierSemaine(cal, n, { nbSeances: 3, joursDisponibles: tousLesJours(n) });
      expect(p.seances.some((s) => s.course && s.date === semaine(n).fin), `S${n}`).toBe(false);
    }
  });

  it('tient compte du dimanche précédent : pas 2 jours de course de suite', () => {
    const dimancheCourse = [{ date: '2026-12-06', charge: 'moyenne' as const, course: true }];
    const p = planifierSemaine(cal, 3, { nbSeances: 3, joursDisponibles: tousLesJours(3) }, dimancheCourse);
    const lundi = p.seances.find((s) => s.date === '2026-12-07');
    expect(lundi?.course ?? false).toBe(false);
  });

  it('dit « lendemain du tournoi » le lundi qui suit un tournoi', () => {
    const p = planifierSemaine(cal, 10, { nbSeances: 3, joursDisponibles: ['2027-01-25', '2027-01-29', '2027-01-31'] });
    expect(p.messages).toContain('Séance C en version sans course (vélo ou rameur) : elle tombe le lendemain du tournoi.');
  });

  it('ignore un match régulier annulé', () => {
    const p = planifierSemaine(cal, 8, {
      nbSeances: 3,
      joursDisponibles: ['2027-01-11', '2027-01-14', '2027-01-16'],
      matchsAnnules: ['2027-01-13'],
    });
    expect(p.matchs).toEqual([]);
    expect(p.seances.every((s) => s.variante === 'normale')).toBe(true);
  });
});

describe('semaines particulières de 2026-2027', () => {
  it('S1 : les tests de la journée 1 remplacent la séance A', () => {
    const p = planifierSemaine(cal, 1, { nbSeances: 3, joursDisponibles: tousLesJours(1) });
    const test = p.seances.find((s) => s.test === 'journee1');
    expect(test).toMatchObject({ type: 'A', libelle: 'Tests de la journée 1', charge: 'elevee', course: false });
  });

  it('S2 : le test de sprint se fait à la première séance A à partir du 1er décembre', () => {
    const p = planifierSemaine(cal, 2, { nbSeances: 3, joursDisponibles: ['2026-11-30', '2026-12-02', '2026-12-04'] });
    const a = p.seances.find((s) => s.type === 'A');
    expect(a?.test).toBe('sprint');
    expect(a!.date >= '2026-12-01').toBe(true);
  });

  it('S5 (Noël) : 2 séances au plus, d’environ 1 h', () => {
    const p = planifierSemaine(cal, 5, { nbSeances: 4, joursDisponibles: tousLesJours(5) });
    expect(p.seances).toHaveLength(2);
    expect(p.seances.every((s) => s.dureeMax === 60)).toBe(true);
    expect(p.messages).toContain("Période allégée : 2 séances d'environ 1 h, avec les charges gardées.");
  });

  it('S6 : les séances se placent de préférence du 28 au 31 décembre', () => {
    const p = planifierSemaine(cal, 6, { nbSeances: 3, joursDisponibles: tousLesJours(6) });
    expect(p.seances.every((s) => s.date <= '2026-12-31')).toBe(true);
    expect(p.seances.every((s) => s.dureeMax === 90)).toBe(true);
  });

  it('S6 : une séance du 1er au 3 janvier dure 1 h au plus', () => {
    const p = planifierSemaine(cal, 6, { nbSeances: 1, joursDisponibles: ['2027-01-02'] });
    expect(p.seances[0]?.dureeMax).toBe(60);
  });

  it('S9 (tournoi) : 2 séances courtes au plus, rien de chargé dans les 48 h avant le tournoi', () => {
    const p = planifierSemaine(cal, 9, { nbSeances: 4, joursDisponibles: tousLesJours(9) });
    expect(p.seances.length).toBeLessThanOrEqual(2);
    expect(p.seances.every((s) => s.courte)).toBe(true);
    for (const s of p.seances.filter((x) => x.date >= '2027-01-21')) expect(s.charge).toBe('faible');
    expect(p.seances.some((s) => s.date >= '2027-01-23')).toBe(false);
  });

  it('S10 : lundi et mardi en charge faible, tests de la journée 1 en fin de semaine', () => {
    const p = planifierSemaine(cal, 10, { nbSeances: 3, joursDisponibles: tousLesJours(10) });
    for (const s of p.seances.filter((x) => x.date <= '2027-01-26')) expect(s.charge).toBe('faible');
    const test = p.seances.find((s) => s.test === 'journee1');
    // Vendredi plutôt que dimanche : S11 commence par le test de Cooper le lundi.
    expect(test?.date).toBe('2027-01-29');
  });

  it('S10 puis S11 : le test de Cooper ne suit pas un jour chargé ou de course', () => {
    const s10 = planifierSemaine(cal, 10, { nbSeances: 3, joursDisponibles: tousLesJours(10) });
    const s11 = planifierSemaine(cal, 11, { nbSeances: 3, joursDisponibles: tousLesJours(11) }, s10.seances);
    const cooper = s11.seances.find((s) => s.test === 'cooper')!;
    expect(cooper).toBeDefined(); // un test prévu n'est jamais retiré
    const veille = s10.seances.find((s) => s.date === ajouterJours(cooper.date, -1));
    expect(veille === undefined || (veille.charge !== 'elevee' && !veille.course)).toBe(true);
  });

  it('S11 : le test de Cooper remplace la séance C, en début de semaine', () => {
    const p = planifierSemaine(cal, 11, { nbSeances: 3, joursDisponibles: tousLesJours(11) });
    const cooper = p.seances.find((s) => s.test === 'cooper');
    expect(cooper).toMatchObject({ type: 'C', libelle: 'Test de Cooper', charge: 'elevee' });
    expect(cooper!.date <= '2027-02-02').toBe(true);
  });

  it('S16 : rien de chargé pour les jambes dans les 48 h avant le début de la saison', () => {
    const p = planifierSemaine(cal, 16, { nbSeances: 4, joursDisponibles: tousLesJours(16) });
    for (const s of p.seances.filter((x) => x.date >= '2027-03-11')) expect(s.charge).toBe('faible');
  });

  it('S16 : quand aucun jour ne permet A ni B, la séance D les remplace', () => {
    const p = planifierSemaine(cal, 16, { nbSeances: 1, joursDisponibles: tousLesJours(16) });
    expect(p.seances).toMatchObject([{ type: 'D', charge: 'faible' }]);
    expect(p.messages).toEqual([
      'Les jours choisis ne permettent pas la séance unique en respectant les règles (matchs, repos, tibias). La séance D la remplace (moins de charge pour les jambes).',
    ]);
  });

  it('semaine de tournoi après un dimanche chargé : C et D plutôt que rien', () => {
    const dimancheCharge = [{ date: '2027-01-17', charge: 'elevee' as const, course: false }];
    const p = planifierSemaine(cal, 9, { nbSeances: 4, joursDisponibles: tousLesJours(9) }, dimancheCharge);
    expect(p.seances.length).toBe(2);
    expect(p.seances.map((s) => s.type).sort()).toEqual(['C', 'D']);
    expect(p.seances.some((s) => s.charge === 'elevee')).toBe(false);
    expect(p.messages).toContain(
      'Les jours choisis ne permettent pas les séances A et B en respectant les règles (matchs, repos, tibias). Les séances C et D les remplacent (moins de charge pour les jambes).',
    );
  });

  it('évite une séance chargée le dimanche quand c’est possible, pour laisser le lundi suivant à A', () => {
    const s8 = planifierSemaine(cal, 8, { nbSeances: 3, joursDisponibles: tousLesJours(8) });
    expect(s8.seances.some((s) => s.date === '2027-01-17' && s.charge === 'elevee')).toBe(false);
    const s9 = planifierSemaine(cal, 9, { nbSeances: 3, joursDisponibles: tousLesJours(9) }, s8.seances);
    expect(s9.seances.find((s) => s.date === '2027-01-18')?.type).toBe('A');
  });

  it('S16 : la semaine s’arrête le vendredi 12 mars', () => {
    const p = planifierSemaine(cal, 16, { nbSeances: 3, joursDisponibles: tousLesJours(16) });
    expect(p.seances.every((s) => s.date <= '2027-03-12')).toBe(true);
  });
});

describe('changer une semaine en cours de route (section 4)', () => {
  const plan3 = () => planifierSemaine(cal, 3, { nbSeances: 3, joursDisponibles: tousLesJours(3) });

  it('retrait : les séances faites restent, le reste est recalculé avec une séance de moins', () => {
    const avant = plan3();
    const a = avant.seances.find((s) => s.type === 'A')!;
    const p = planifierSemaine(cal, 3, { nbSeances: 2, joursDisponibles: tousLesJours(3), depuis: ajouterJours(a.date, 1) }, [], [a]);
    expect(p.seances.map((s) => s.type).sort()).toEqual(['A', 'B']);
    expect(p.seances.find((s) => s.type === 'A')?.date).toBe(a.date);
    expect(p.seances.every((s) => s === a || s.date > a.date)).toBe(true);
    expect(p.messages[0]).toBe('Semaine recalculée : les séances déjà faites restent, les autres sont replacées sur les jours qui restent.');
  });

  it('ajout : la séance qui manque selon l’ordre de priorité, ou D si la semaine en compte déjà 3', () => {
    const avant = plan3();
    const a = avant.seances.find((s) => s.type === 'A')!;
    const p = planifierSemaine(cal, 3, { nbSeances: 4, joursDisponibles: tousLesJours(3), depuis: ajouterJours(a.date, 1) }, [], [a]);
    expect(p.seances.map((s) => s.type).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('match déclaré après coup : le lendemain passe en charge faible et les jours qui restent sont réorganisés', () => {
    // S3 : A faite le lundi, match imprévu le mardi, déclaré le mercredi.
    const a = { ...plan3().seances.find((s) => s.type === 'A')!, date: '2026-12-07' };
    const p = planifierSemaine(
      cal,
      3,
      { nbSeances: 3, joursDisponibles: tousLesJours(3), matchsSupplementaires: ['2026-12-08'], depuis: '2026-12-09' },
      [],
      [a],
    );
    const mercredi = p.seances.find((s) => s.date === '2026-12-09');
    expect(mercredi === undefined || mercredi.charge === 'faible').toBe(true);
    expect(p.seances.filter((s) => s.date >= '2026-12-09').length).toBe(2);
    verifierRegles({ ...p, seances: p.seances.filter((s) => s.date >= '2026-12-09') }, ['2026-12-08']);
  });

  it('un test déjà fait n’est pas reprogrammé', () => {
    const s1 = planifierSemaine(cal, 1, { nbSeances: 3, joursDisponibles: tousLesJours(1) });
    const tests = s1.seances.find((s) => s.test === 'journee1')!;
    const p = planifierSemaine(cal, 1, { nbSeances: 3, joursDisponibles: tousLesJours(1), depuis: '2026-11-25' }, [], [tests]);
    expect(p.seances.filter((s) => s.test === 'journee1')).toHaveLength(1);
    expect(p.seances.length).toBe(3);
  });
});
