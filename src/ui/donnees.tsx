import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Statut } from '../donnees/types';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from '../moteur/calendrier';
import type { DateISO } from '../moteur/dates';
import type { ChoixSemaine } from '../moteur/semaine';
import type { Calendrier, ProgrammeConfig } from '../moteur/types';
import * as idb from '../stockage/idb';
import { calculerSaison, dateLocale, type SemaineCalculee } from '../stockage/saison';
import { DONNEES_VIDES, type Donnees, type Preferences, type ResultatSeance } from '../stockage/types';

interface ContexteDonnees {
  cal: Calendrier;
  donnees: Donnees;
  saison: SemaineCalculee[];
  aujourdhui: DateISO;
  /** Message si les données ne peuvent pas être enregistrées sur ce téléphone. */
  erreur?: string;
  choisirSemaine: (numero: number, choix: ChoixSemaine | null) => void;
  enregistrerResultat: (resultat: ResultatSeance) => void;
  supprimerResultat: (date: DateISO) => void;
  modifierPreferences: (p: Partial<Preferences>) => void;
  demanderSemaineLegere: (numero: number, oui: boolean) => void;
  modifierSaison: (saison: Donnees['saison']) => void;
  noterMatch: (date: DateISO, effort: number) => void;
  basculerRoutine: (date: DateISO) => void;
  changerStatut: (id: string, statut: Statut | null) => void;
  /** Nouveau programme : remplace la saison en cours (choix, résultats, matchs) et garde les réglages. */
  nouveauProgramme: (config: ProgrammeConfig) => Promise<void>;
  importer: (d: Donnees) => Promise<void>;
}

const Contexte = createContext<ContexteDonnees | null>(null);


export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string>();
  const [aujourdhui, setAujourdhui] = useState(dateLocale());

  useEffect(() => {
    idb
      .chargerDonnees()
      .then(setDonnees)
      .catch(() => {
        setErreur("Ce navigateur ne permet pas d'enregistrer les données (navigation privée ?). Rien ne sera gardé en fermant l'app.");
        setDonnees(structuredClone(DONNEES_VIDES));
      });
    void idb.demanderStockagePersistant();
    // L'app peut rester ouverte d'un jour à l'autre : on met la date à jour au retour.
    const majDate = () => document.visibilityState === 'visible' && setAujourdhui(dateLocale());
    document.addEventListener('visibilitychange', majDate);
    return () => document.removeEventListener('visibilitychange', majDate);
  }, []);

  const ecrire = useCallback((promesse: Promise<void>) => {
    promesse.catch(() => setErreur("L'enregistrement a échoué. Exporte une sauvegarde dès que possible."));
  }, []);

  const choisirSemaine = useCallback(
    (numero: number, choix: ChoixSemaine | null) => {
      setDonnees((d) => {
        if (!d) return d;
        const suivant = { ...d.choix };
        if (choix) suivant[numero] = choix;
        else delete suivant[numero];
        return { ...d, choix: suivant };
      });
      ecrire(idb.enregistrerChoix(numero, choix));
    },
    [ecrire],
  );

  const enregistrerResultat = useCallback(
    (resultat: ResultatSeance) => {
      setDonnees((d) => (d ? { ...d, resultats: { ...d.resultats, [resultat.date]: resultat } } : d));
      ecrire(idb.enregistrerResultat(resultat));
    },
    [ecrire],
  );

  const supprimerResultat = useCallback(
    (date: DateISO) => {
      setDonnees((d) => {
        if (!d) return d;
        const suivant = { ...d.resultats };
        delete suivant[date];
        return { ...d, resultats: suivant };
      });
      ecrire(idb.supprimerResultat(date));
    },
    [ecrire],
  );

  const modifierPreferences = useCallback(
    (p: Partial<Preferences>) => {
      setDonnees((d) => {
        if (!d) return d;
        const preferences = { ...d.preferences, ...p };
        ecrire(idb.enregistrerPreferences(preferences));
        return { ...d, preferences };
      });
    },
    [ecrire],
  );

  const demanderSemaineLegere = useCallback(
    (numero: number, oui: boolean) => {
      setDonnees((d) => {
        if (!d) return d;
        const sans = (d.legeresDemandees ?? []).filter((n) => n !== numero);
        const legeresDemandees = oui ? [...sans, numero].sort((a, b) => a - b) : sans;
        ecrire(idb.enregistrerLegeres(legeresDemandees));
        return { ...d, legeresDemandees };
      });
    },
    [ecrire],
  );

  const modifierSaison = useCallback(
    (saison: Donnees['saison']) => {
      setDonnees((d) => (d ? { ...d, saison } : d));
      ecrire(idb.enregistrerSaison(saison));
    },
    [ecrire],
  );

  const noterMatch = useCallback(
    (date: DateISO, effort: number) => {
      setDonnees((d) => {
        if (!d) return d;
        const notesMatchs = { ...d.notesMatchs, [date]: effort };
        ecrire(idb.enregistrerNotesMatchs(notesMatchs));
        return { ...d, notesMatchs };
      });
    },
    [ecrire],
  );

  const basculerRoutine = useCallback(
    (date: DateISO) => {
      setDonnees((d) => {
        if (!d) return d;
        const avant = d.routinesMaison ?? [];
        const routinesMaison = avant.includes(date) ? avant.filter((x) => x !== date) : [...avant, date].sort();
        ecrire(idb.enregistrerRoutines(routinesMaison));
        return { ...d, routinesMaison };
      });
    },
    [ecrire],
  );

  const changerStatut = useCallback(
    (id: string, statut: Statut | null) => {
      setDonnees((d) => {
        if (!d) return d;
        const statuts = { ...d.statuts };
        if (statut) statuts[id] = statut;
        else delete statuts[id];
        ecrire(idb.enregistrerStatuts(statuts));
        return { ...d, statuts };
      });
    },
    [ecrire],
  );

  const nouveauProgramme = useCallback(
    async (programme: ProgrammeConfig) => {
      if (!donnees) return;
      const nouvelles: Donnees = { ...structuredClone(DONNEES_VIDES), programme, statuts: donnees.statuts, preferences: donnees.preferences };
      await idb.remplacerDonnees(nouvelles);
      setDonnees(nouvelles);
    },
    [donnees],
  );

  const importer = useCallback(async (d: Donnees) => {
    await idb.remplacerDonnees(d);
    setDonnees(d);
  }, []);

  const programme = donnees?.programme;
  const cal = useMemo(() => genererCalendrier(programme ?? SAISON_2026_2027), [programme]);
  const saison = useMemo(() => (donnees ? calculerSaison(cal, donnees, aujourdhui) : []), [cal, donnees, aujourdhui]);

  if (!donnees) return <p className="chargement">Chargement…</p>;
  return (
    <Contexte.Provider
      value={{ cal, donnees, saison, aujourdhui, erreur, choisirSemaine, enregistrerResultat, supprimerResultat, modifierPreferences, demanderSemaineLegere, modifierSaison, noterMatch, basculerRoutine, changerStatut, nouveauProgramme, importer }}
    >
      {children}
    </Contexte.Provider>
  );
}

export function useDonnees(): ContexteDonnees {
  const c = useContext(Contexte);
  if (!c) throw new Error('useDonnees hors du fournisseur');
  return c;
}
