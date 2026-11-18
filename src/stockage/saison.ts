// Recalcule toute la saison à partir de ce que Lily a entré : choix de chaque semaine, résultats, décisions d'essai.
// Une séance déjà commencée garde le contenu figé à sa première saisie.

import { detaillerSemaine, type EtatContenu, type SeanceDetaillee } from '../moteur/contenu';
import { ecartJours, type DateISO } from '../moteur/dates';
import { genererCalendrier } from '../moteur/calendrier';
import {
  allures,
  apresSemaine,
  conditionCooper,
  intermittentsEnPlus,
  PROGRESSION_INITIALE,
  semainesLegeresAnticipees,
  seriesEnPlus,
  suiviDouleurs,
  type EtatProgression,
} from '../moteur/progression';
import { planifierSemaine, type ChoixSemaine, type PlanSemaine, type SeancesPrecedentes } from '../moteur/semaine';
import type { Calendrier, RetestPrevu, Semaine, TypeRetest } from '../moteur/types';
import type { Donnees, ResultatSeance } from './types';

export type EtatSeance = 'a-faire' | 'en-cours' | 'faite' | 'manquee';

export interface SeanceAffichee {
  seance: SeanceDetaillee;
  resultat?: ResultatSeance;
  etat: EtatSeance;
}

export interface SemaineCalculee {
  semaine: Semaine;
  choix?: ChoixSemaine;
  plan?: PlanSemaine;
  seances: SeanceAffichee[];
  messages: string[];
  /** Une séance a déjà été saisie : les jours ne peuvent plus être changés. */
  commencee: boolean;
  /** Progression au début de la semaine (étape de course, sprints, niveau de pliométrie). */
  progression: EtatProgression;
  /** Lily a demandé que cette semaine soit légère. */
  legereDemandee: boolean;
}

/** Date du jour sur le téléphone (heure locale), au format AAAA-MM-JJ. */
export function dateLocale(d = new Date()): DateISO {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/** Semaine à afficher en ouvrant l'app : celle du jour, la 1re avant le début, la dernière après la fin. */
export function semaineDuJour(cal: Calendrier, aujourdhui: DateISO): number {
  const s = cal.semaines.find((x) => aujourdhui >= x.debut && aujourdhui <= x.fin);
  if (s) return s.numero;
  return aujourdhui < cal.semaines[0]!.debut ? 1 : cal.semaines.length;
}

/** Décisions après les essais (section 6), la plus récente l'emporte. */
export function decisionsEssais(donnees: Donnees): Pick<EtatContenu, 'statuts' | 'reessais'> {
  const statuts: NonNullable<EtatContenu['statuts']> = {};
  const reessais = new Set<string>();
  const resultats = Object.values(donnees.resultats).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of resultats) {
    for (const [cle, ex] of Object.entries(r.exercices)) {
      if (!ex.decision) continue;
      const id = cle.slice(cle.indexOf(':') + 1);
      if (ex.decision === 'garde') statuts[id] = 'valide';
      if (ex.decision === 'refuse') statuts[id] = 'exclu';
      if (ex.decision === 'reessai') reessais.add(id);
      else reessais.delete(id);
    }
  }
  return { statuts, reessais: [...reessais] };
}

/** Exercices « à essayer » vraiment faits pendant une séance terminée. */
function essaisFaits(r: ResultatSeance): string[] {
  if (!r.terminee) return [];
  return r.seance.contenu.blocs.flatMap((b) =>
    b.exercices.filter((p) => p.essai && !r.exercices[`${b.type}:${p.id}`]?.pasFait).map((p) => p.id),
  );
}

/** Test présent dans une séance : journée 1 (squat), sprint, Cooper. */
const TEST_DE: Partial<Record<TypeRetest, string>> = { journee1: 'T-F1', sprint: 'T-sprint-10', cooper: 'T-cooper' };
const contientTest = (r: ResultatSeance, type: TypeRetest) => r.terminee && r.seance.contenu.blocs.some((b) => b.exercices.some((p) => p.id === TEST_DE[type]));
const testFait = (donnees: Donnees, type: TypeRetest) => Object.values(donnees.resultats).some((r) => contientTest(r, type));

export function calculerSaison(calBase: Calendrier, donnees: Donnees, aujourdhui: DateISO): SemaineCalculee[] {
  // Semaines légères anticipées ou demandées (section 6) : le calendrier est refait avec elles,
  // ce qui remet à zéro le compte des semaines normales de suite.
  const anticipees = semainesLegeresAnticipees(donnees, donnees.legeresDemandees ?? []).filter((l) => l.semaine <= calBase.semaines.length);
  const cal = anticipees.length
    ? genererCalendrier({ ...calBase.config, semainesLegeres: [...calBase.config.semainesLegeres, ...anticipees] })
    : genererCalendrier(calBase.config);
  const { statuts, reessais } = decisionsEssais(donnees);
  const vitesses = allures(donnees);
  const cotes = seriesEnPlus(donnees);
  let reportes: RetestPrevu[] = [];
  const essais: Record<string, number> = {};
  const compter = (ids: string[]) => ids.forEach((id) => (essais[id] = (essais[id] ?? 0) + 1));
  let precedentes: SeancesPrecedentes = [];
  let progression: EtatProgression = PROGRESSION_INITIALE;
  const douleurs = suiviDouleurs(donnees);
  let courseEnCardioApres = douleurs.courseEnCardioApres;

  return cal.semaines.map((semaine) => {
    const choix = donnees.choix[semaine.numero];
    const messagesTests: string[] = [];
    // Test manqué la semaine d'avant : il est reporté (sauf pendant l'affûtage, sans test).
    if (reportes.length && semaine.phase !== 'affutage') {
      for (const r of reportes) {
        if (semaine.retests.some((x) => x.type === r.type)) continue;
        // Reportée après le 1er décembre, la journée 1 comprend aussi le sprint.
        semaine.retests.push({ ...r, semaine: semaine.numero, moment: 'semaine', sansSprint: false });
        messagesTests.push(`${r.type === 'cooper' ? 'Test de Cooper' : r.type === 'sprint' ? 'Test de sprint' : 'Tests de la journée 1'} reporté de la semaine dernière.`);
      }
    }
    reportes = [];
    // Test de Cooper « dès que la condition est remplie » : 20 min de course en continu, deux fois, sans douleur.
    const condition = semaine.retests.find((r) => r.type === 'cooper' && r.moment === 'condition');
    if (condition && !testFait(donnees, 'cooper') && conditionCooper(donnees, semaine.debut)) {
      semaine.retests = semaine.retests.map((r) => (r === condition ? { ...r, moment: 'semaine' } : r));
      messagesTests.push('Test de Cooper proposé cette semaine : tu as couru 20 min en continu deux fois sans douleur.');
    }
    const resultats = Object.values(donnees.resultats).filter((r) => r.semaine === semaine.numero);
    const auDebut = progression;
    const aVenir = semaine.fin >= aujourdhui;
    if (!choix) {
      // Pas de plan cette semaine : seules les séances déjà saisies comptent.
      resultats.forEach((r) => compter(essaisFaits(r)));
      precedentes = resultats.map((r) => r.seance);
      const seances = resultats.map((r) => ({ seance: r.seance, resultat: r, etat: r.terminee ? ('faite' as const) : ('en-cours' as const) }));
      progression = apresSemaine(progression, semaine, seances);
      if (semaine.fin < aujourdhui) {
        for (const r of semaine.retests) {
          if (r.type !== 'mini' && r.moment !== 'condition' && !resultats.some((x) => contientTest(x, r.type))) reportes.push(r);
        }
      }
      return {
        semaine,
        seances,
        messages: aVenir ? douleurs.alertes : [],
        commencee: resultats.length > 0,
        progression: auDebut,
        legereDemandee: (donnees.legeresDemandees ?? []).includes(semaine.numero),
      };
    }

    // Retour après 10 jours ou plus sans entraînement : la course reprend une étape plus bas (section 5).
    const reference = semaine.debut > aujourdhui ? semaine.debut : aujourdhui;
    const retour = aVenir && progression.dernierJour !== undefined && ecartJours(progression.dernierJour, reference) >= 10;
    const plan = planifierSemaine(cal, semaine.numero, choix, precedentes);
    const contenu = detaillerSemaine(cal, plan, {
      statuts,
      reessais,
      essais: { ...essais },
      etapeCourse: Math.max(1, progression.etapeCourse - (retour ? 1 : 0)),
      sprintsEnPlus: progression.phaseSprints === semaine.phase ? progression.sprintsEnPlus : 0,
      niveauPlio: progression.niveauPlio,
      vitesseMaxEnPauseJusquau: douleurs.vitesseMaxEnPauseJusquau,
      pauseCourse: aVenir && douleurs.pauseCourse,
      pausePlio: aVenir && douleurs.pausePlio,
      courseEnCardioApres,
      vma: vitesses.vma,
      intermittentsEnPlus: intermittentsEnPlus(cal, donnees, semaine.debut),
      seriesEnPlus: cotes,
    });
    if (contenu.courseEnCardioUtilisee) courseEnCardioApres = undefined;
    const seances: SeanceAffichee[] = contenu.seances.map((s) => {
      const resultat = donnees.resultats[s.date];
      if (resultat) {
        compter(essaisFaits(resultat));
        return { seance: resultat.seance, resultat, etat: resultat.terminee ? 'faite' : 'en-cours' };
      }
      // Une séance à venir compte comme faite pour les essais des semaines suivantes ; une séance manquée, non.
      if (s.date >= aujourdhui) compter(s.contenu.essais);
      return { seance: s, etat: s.date < aujourdhui ? 'manquee' : 'a-faire' };
    });
    // Séances saisies un jour qui n'est plus dans le plan (rare) : on les garde.
    for (const r of resultats) {
      if (!seances.some((s) => s.seance.date === r.date)) {
        compter(essaisFaits(r));
        seances.push({ seance: r.seance, resultat: r, etat: r.terminee ? 'faite' : 'en-cours' });
      }
    }
    seances.sort((a, b) => (a.seance.date < b.seance.date ? -1 : 1));
    precedentes = seances.map((s) => s.seance);
    progression = apresSemaine(progression, semaine, seances);
    // Semaine finie sans le test prévu (séance manquée, ou A placée avant le sprint à 100 %) : report.
    if (semaine.fin < aujourdhui) {
      for (const r of semaine.retests) {
        if (r.type === 'mini' || r.moment === 'condition') continue;
        if (!seances.some((s) => s.resultat && contientTest(s.resultat, r.type))) reportes.push(r);
      }
    }
    return {
      semaine,
      choix,
      plan,
      seances,
      messages: [...(aVenir ? douleurs.alertes : []), ...messagesTests, ...plan.messages, ...contenu.messages],
      commencee: resultats.length > 0,
      progression: auDebut,
      legereDemandee: (donnees.legeresDemandees ?? []).includes(semaine.numero),
    };
  });
}
