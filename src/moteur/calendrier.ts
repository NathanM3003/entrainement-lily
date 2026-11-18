import { ajouterJours, dansIntervalle, ecartJours, joursEntre, jourSemaine, lundiDe, type DateISO } from './dates';
import { decouperPhases, rangSemaineCoupure } from './phases';
import type { Calendrier, Evenement, Legerete, Phase, ProgrammeConfig, Semaine } from './types';

/**
 * Calendrier d'un programme : semaines, phases, semaines légères, événements et retests.
 * Règles du programme : sections 0, 1, 3 (tournois et périodes allégées) et 6.
 */
export function genererCalendrier(config: ProgrammeConfig): Calendrier {
  const { debut, echeance } = config;
  if (echeance <= debut) throw new Error("L'échéance doit être après le début du programme.");

  // Si le début n'est pas un lundi, les jours avant le premier lundi servent aux tests de la journée 1.
  const premierLundi = jourSemaine(debut) === 1 ? debut : ajouterJours(lundiDe(debut), 7);
  const prelude = premierLundi === debut ? [] : joursEntre(debut, ajouterJours(premierLundi, -1));

  // La semaine qui contient l'échéance compte comme la dernière ; elle s'arrête la veille.
  const dernierJour = ajouterJours(echeance, -1);
  if (dernierJour < premierLundi) throw new Error("Pas de semaine complète avant l'échéance.");
  const n = ecartJours(premierLundi, lundiDe(dernierJour)) / 7 + 1;

  const { segments, avertissement } = decouperPhases(n);
  const phases: { phase: Phase; rang: number; bloc?: 1 | 2; coupure: boolean }[] = [];
  for (const { phase, semaines } of segments) {
    const coupure = rangSemaineCoupure(semaines);
    for (let rang = 1; rang <= semaines; rang++) {
      phases.push({
        phase,
        rang,
        bloc: coupure === null ? undefined : rang < coupure ? 1 : 2,
        coupure: rang === coupure,
      });
    }
  }

  const semaines: Semaine[] = phases.map((p, i) => {
    const numero = i + 1;
    const lundi = ajouterJours(premierLundi, 7 * i);
    const fin = minDate(ajouterJours(lundi, 6), dernierJour);
    const jours = joursEntre(lundi, fin);

    const periodes = config.periodesAllegees.filter((pa) => jours.some((j) => dansIntervalle(j, pa.debut, pa.fin)));
    const joursAlleges = jours.filter((j) => periodes.some((pa) => dansIntervalle(j, pa.debut, pa.fin)));

    // Après un tournoi : lundi et mardi suivants en charge faible ou repos.
    const joursRecuperation = jours.filter((j) =>
      config.tournois.some((t) => {
        const lundiSuivant = ajouterJours(lundiDe(t.fin), 7);
        return j === lundiSuivant || j === ajouterJours(lundiSuivant, 1);
      }),
    );

    const raisonsCompletes: string[] = [];
    for (const pa of periodes) {
      if (jours.every((j) => dansIntervalle(j, pa.debut, pa.fin))) raisonsCompletes.push(`Période allégée : ${pa.nom}`);
    }
    for (const sl of config.semainesLegeres) if (sl.semaine === numero) raisonsCompletes.push(sl.raison);
    if (p.phase === 'affutage') raisonsCompletes.push('Affûtage');
    if (p.coupure) raisonsCompletes.push('Semaine plus légère entre les deux blocs de la phase');

    let legere: Legerete | null = null;
    if (raisonsCompletes.length > 0) {
      legere = { etendue: 'complete', raisons: raisonsCompletes };
      if (joursRecuperation.length > 0) legere.raisons.push('Récupération après le tournoi');
    } else if (joursRecuperation.length > 0) {
      legere = { etendue: 'debut', raisons: ['Récupération après le tournoi'] };
    }

    return {
      numero,
      debut: lundi,
      fin,
      phase: p.phase,
      rangDansPhase: p.rang,
      bloc: p.bloc,
      legere,
      tournoi: config.tournois.some((t) => jours.some((j) => dansIntervalle(j, t.debut, t.fin))),
      joursAlleges,
      joursRecuperation,
      evenements: evenementsDe(config, jours),
      retests: config.retests.filter((r) => r.semaine === numero),
    };
  });

  appliquerMaximumSemainesNormales(semaines);

  const avertissements = [
    ...(avertissement ? [avertissement] : []),
    ...config.retests
      .filter((r) => r.semaine < 1 || r.semaine > n)
      .map((r) => `Retest prévu hors du programme (semaine ${r.semaine}).`),
  ];

  return { config, prelude, semaines, avertissements };
}

function evenementsDe(config: ProgrammeConfig, jours: DateISO[]): Evenement[] {
  const evenements: Evenement[] = [];
  const { sprint, changementsDeDirection } = config.restrictions;
  for (const date of jours) {
    if (sprint && date === ajouterJours(sprint.jusquau, 1)) {
      evenements.push({ date, type: 'sprint-100', nom: 'Sprint à 100 % permis' });
    }
    if (changementsDeDirection && date === ajouterJours(changementsDeDirection.jusquau, 1)) {
      evenements.push({ date, type: 'changements-de-direction', nom: 'Changements de direction permis' });
    }
    const tournoi = config.tournois.find((t) => dansIntervalle(date, t.debut, t.fin));
    if (tournoi) {
      evenements.push({ date, type: 'tournoi', nom: tournoi.nom });
      continue; // pas de match régulier un jour de tournoi
    }
    for (const m of config.matchsReguliers) {
      if (jourSemaine(date) === m.jour && date >= m.debut && (!m.fin || date <= m.fin)) {
        evenements.push({ date, type: 'match', nom: m.nom });
      }
    }
    for (const m of config.matchsPonctuels ?? []) {
      if (m.date === date && !evenements.some((e) => e.type === 'match' && e.date === date)) evenements.push({ date, type: 'match', nom: m.nom });
    }
  }
  return evenements;
}

/**
 * Au maximum 4 semaines normales de suite (Règles, section 6). Les vacances, la semaine qui suit
 * un tournoi et les semaines de retest comptent comme des semaines légères. Une 5e semaine normale
 * de suite devient légère.
 */
function appliquerMaximumSemainesNormales(semaines: Semaine[]): void {
  let normalesDeSuite = 0;
  for (const s of semaines) {
    const compteCommeLegere =
      s.legere !== null || s.joursAlleges.length > 0 || s.retests.some((r) => r.moment !== 'condition');
    if (compteCommeLegere) {
      normalesDeSuite = 0;
      continue;
    }
    normalesDeSuite++;
    if (normalesDeSuite > 4) {
      s.legere = { etendue: 'complete', raisons: ['Pas plus de 4 semaines normales de suite'] };
      normalesDeSuite = 0;
    }
  }
}

const minDate = (a: DateISO, b: DateISO): DateISO => (a < b ? a : b);
