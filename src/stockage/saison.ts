// Recalcule toute la saison à partir de ce que Lily a entré : choix de chaque semaine, résultats, décisions d'essai.
// Une séance déjà commencée garde le contenu figé à sa première saisie.

import { detaillerSemaine, type EtatContenu, type SeanceDetaillee } from '../moteur/contenu';
import type { DateISO } from '../moteur/dates';
import { planifierSemaine, type ChoixSemaine, type PlanSemaine, type SeancesPrecedentes } from '../moteur/semaine';
import type { Calendrier, Semaine } from '../moteur/types';
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

export function calculerSaison(cal: Calendrier, donnees: Donnees, aujourdhui: DateISO): SemaineCalculee[] {
  const { statuts, reessais } = decisionsEssais(donnees);
  const essais: Record<string, number> = {};
  const compter = (ids: string[]) => ids.forEach((id) => (essais[id] = (essais[id] ?? 0) + 1));
  let precedentes: SeancesPrecedentes = [];

  return cal.semaines.map((semaine) => {
    const choix = donnees.choix[semaine.numero];
    const resultats = Object.values(donnees.resultats).filter((r) => r.semaine === semaine.numero);
    if (!choix) {
      // Pas de plan cette semaine : seules les séances déjà saisies comptent.
      resultats.forEach((r) => compter(essaisFaits(r)));
      precedentes = resultats.map((r) => r.seance);
      const seances = resultats.map((r) => ({ seance: r.seance, resultat: r, etat: r.terminee ? ('faite' as const) : ('en-cours' as const) }));
      return { semaine, seances, messages: [], commencee: resultats.length > 0 };
    }

    const plan = planifierSemaine(cal, semaine.numero, choix, precedentes);
    const contenu = detaillerSemaine(cal, plan, { statuts, reessais, essais: { ...essais } });
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
    return {
      semaine,
      choix,
      plan,
      seances,
      messages: [...plan.messages, ...contenu.messages],
      commencee: resultats.length > 0,
    };
  });
}
