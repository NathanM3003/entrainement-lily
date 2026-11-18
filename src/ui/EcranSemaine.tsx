import { useState } from 'react';
import { ajouterJours, dateCourte, joursEntre, jourSemaine, type DateISO } from '../moteur/dates';
import type { ChoixSemaine } from '../moteur/semaine';
import { LIBELLES_PHASES, type Semaine } from '../moteur/types';
import { douleursDemandees, LIBELLES_DOULEURS } from '../stockage/saisie';
import { rappelSauvegarde } from '../stockage/sauvegarde';
import type { SeanceAffichee, SemaineCalculee } from '../stockage/saison';
import type { Douleurs } from '../stockage/types';
import { Echelle, jourCourt, jourEtDate, majuscule } from './communs';
import { useDonnees } from './donnees';

const ETATS: Record<SeanceAffichee['etat'], string> = {
  'a-faire': 'À faire',
  'en-cours': 'Commencée',
  faite: 'Faite',
  manquee: 'Pas faite',
};

const NOMS_TESTS = { journee1: 'Tests de la journée 1', sprint: 'Test de sprint', mini: 'Mini-retest', cooper: 'Test de Cooper' };

/** Ce qui se passe cette semaine : phase, semaine légère, tournoi, matchs, tests, dates clés. */
function evenements(s: Semaine): string[] {
  const liste: string[] = [];
  if (s.legere) liste.push(s.legere.etendue === 'complete' ? `Semaine légère : ${s.legere.raisons.join(', ').toLowerCase()}` : 'Début de semaine léger (récupération)');
  for (const e of s.evenements) {
    if (e.type === 'tournoi') {
      if (!liste.some((l) => l.startsWith(e.nom))) liste.push(`${e.nom} : ${jourEtDate(e.date)}`);
      else liste[liste.findIndex((l) => l.startsWith(e.nom))] += ` et ${jourEtDate(e.date)}`;
    }
    if (e.type === 'match') liste.push(`${e.nom} : ${jourEtDate(e.date)}`);
    if (e.type === 'sprint-100') liste.push(`Sprint à 100 % à partir du ${jourEtDate(e.date)}`);
    if (e.type === 'changements-de-direction') liste.push(`Retour des changements de direction le ${jourEtDate(e.date)}`);
  }
  for (const r of s.retests) {
    if (r.moment === 'condition') liste.push('Test de Cooper possible dès que tu cours 20 min sans douleur');
    else liste.push(`${NOMS_TESTS[r.type]}${r.final ? ' (retest final)' : ''}`);
  }
  return liste;
}

export function EcranSemaine({ numero }: { numero: number }) {
  const { saison, cal, donnees, aujourdhui, choisirSemaine } = useDonnees();
  const calc = saison[numero - 1];
  const [modification, setModification] = useState(false);
  if (!calc) return <p>Semaine introuvable.</p>;
  const { semaine } = calc;
  const afficherChoix = !calc.choix || modification;

  return (
    <main className="page">
      <nav className="semaines" aria-label="Changer de semaine">
        <a className="bouton-icone" href={`#/semaine/${numero - 1}`} aria-disabled={numero <= 1} aria-label="Semaine précédente" onClick={(e) => numero <= 1 && e.preventDefault()}>
          ‹
        </a>
        <div>
          <p className="surtitre">
            Semaine {numero} · {LIBELLES_PHASES[semaine.phase]}
          </p>
          <h1>
            {dateCourte(semaine.debut)} → {dateCourte(semaine.fin)}
          </h1>
        </div>
        <a
          className="bouton-icone"
          href={`#/semaine/${numero + 1}`}
          aria-disabled={numero >= cal.semaines.length}
          aria-label="Semaine suivante"
          onClick={(e) => numero >= cal.semaines.length && e.preventDefault()}
        >
          ›
        </a>
      </nav>

      {rappelSauvegarde(donnees, aujourdhui) && (
        <p className="bandeau">
          Pense à sauvegarder tes données (une fois par semaine). <a href="#/sauvegarde">Sauvegarder</a>
        </p>
      )}

      <DouleursDuLendemain />

      {evenements(semaine).length > 0 && (
        <ul className="evenements">
          {evenements(semaine).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {afficherChoix ? (
        <ChoixDeLaSemaine
          calc={calc}
          precedent={donnees.choix[numero - 1]}
          onValider={(choix) => {
            choisirSemaine(numero, choix);
            setModification(false);
          }}
          onAnnuler={calc.choix ? () => setModification(false) : undefined}
        />
      ) : (
        <PlanDeLaSemaine calc={calc} aujourdhui={aujourdhui} onModifier={() => setModification(true)} />
      )}
    </main>
  );
}

function ChoixDeLaSemaine({
  calc,
  precedent,
  onValider,
  onAnnuler,
}: {
  calc: SemaineCalculee;
  precedent?: ChoixSemaine;
  onValider: (c: ChoixSemaine) => void;
  onAnnuler?: () => void;
}) {
  const jours = joursEntre(calc.semaine.debut, calc.semaine.fin);
  // Par défaut : le choix déjà fait, sinon les mêmes jours de la semaine que la semaine d'avant, sinon tous les jours.
  const joursParDefaut = (): DateISO[] => {
    if (calc.choix) return calc.choix.joursDisponibles;
    if (precedent) {
      const jds = new Set(precedent.joursDisponibles.map(jourSemaine));
      const memes = jours.filter((j) => jds.has(jourSemaine(j)));
      if (memes.length) return memes;
    }
    return jours;
  };
  const [nb, setNb] = useState(calc.choix?.nbSeances ?? precedent?.nbSeances ?? 3);
  const [dispo, setDispo] = useState<DateISO[]>(joursParDefaut);
  const basculer = (j: DateISO) => setDispo((d) => (d.includes(j) ? d.filter((x) => x !== j) : [...d, j].sort()));
  const matchs = new Set(calc.semaine.evenements.filter((e) => e.type === 'match' || e.type === 'tournoi').map((e) => e.date));

  return (
    <section className="carte">
      <h2>Ta semaine</h2>
      <fieldset className="choix">
        <legend>Combien de séances cette semaine ?</legend>
        <div className="segments">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" aria-pressed={nb === n} onClick={() => setNb(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choix">
        <legend>Quels jours es-tu disponible ?</legend>
        <div className="jours">
          {jours.map((j) => (
            <button key={j} type="button" aria-pressed={dispo.includes(j)} onClick={() => basculer(j)}>
              {jourCourt(j)}
              {matchs.has(j) && <span className="petit">match</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="aide">L'app choisit les jours, le type de chaque séance et son contenu.</p>
      <div className="actions">
        <button type="button" className="principal" disabled={dispo.length === 0} onClick={() => onValider({ ...calc.choix, nbSeances: nb, joursDisponibles: dispo })}>
          Prévoir ma semaine
        </button>
        {onAnnuler && (
          <button type="button" onClick={onAnnuler}>
            Annuler
          </button>
        )}
      </div>
    </section>
  );
}

function PlanDeLaSemaine({ calc, aujourdhui, onModifier }: { calc: SemaineCalculee; aujourdhui: DateISO; onModifier: () => void }) {
  const { demanderSemaineLegere } = useDonnees();
  const dejaLegere = calc.semaine.legere?.etendue === 'complete' && !calc.legereDemandee;
  const jours = joursEntre(calc.semaine.debut, calc.semaine.fin);
  const matchs = calc.plan?.matchs ?? [];
  return (
    <>
      {calc.messages.length > 0 && (
        <ul className="messages">
          {calc.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <ol className="jours-semaine">
        {jours.map((j) => {
          const seance = calc.seances.find((s) => s.seance.date === j);
          const match = matchs.filter((m) => m.date === j);
          const recup = calc.semaine.joursRecuperation.includes(j);
          return (
            <li key={j} className={j === aujourdhui ? 'jour aujourdhui' : 'jour'}>
              <p className="jour-nom">
                {majuscule(jourEtDate(j))}
                {j === aujourdhui && <span className="pastille">Aujourd'hui</span>}
              </p>
              {match.map((m) => (
                <p key={m.nom + m.date} className="match">
                  {m.type === 'tournoi' ? '🏆' : '🥏'} {m.nom}
                </p>
              ))}
              {seance ? (
                <a className={`seance etat-${seance.etat}`} href={`#/seance/${j}`}>
                  <span className="seance-type">{seance.seance.type === 'U' ? '1' : seance.seance.type}</span>
                  <span className="seance-texte">
                    <strong>{seance.seance.libelle}</strong>
                    <span className="petit">
                      environ {seance.seance.contenu.minutes} min · {ETATS[seance.etat]}
                      {seance.seance.contenu.essais.length > 0 && ' · à essayer'}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              ) : (
                match.length === 0 && <p className="repos">{recup ? 'Récupération : repos ou mobilité' : 'Repos'}</p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="aide">Les jours de repos, une routine facultative de 10 min à la maison : M1, M7 et M3 (sans course).</p>
      <div className="actions">
        <button type="button" onClick={onModifier} disabled={calc.commencee}>
          Changer mes jours
        </button>
        {calc.semaine.fin >= aujourdhui && !dejaLegere && (
          <button
            type="button"
            onClick={() =>
              calc.legereDemandee
                ? demanderSemaineLegere(calc.semaine.numero, false)
                : confirm('Rendre cette semaine légère ? Environ 35 % de volume en moins, mêmes charges, pas de nouvel exercice.') &&
                  demanderSemaineLegere(calc.semaine.numero, true)
            }
          >
            {calc.legereDemandee ? 'Annuler la semaine légère' : "J'ai besoin d'une semaine légère"}
          </button>
        )}
      </div>
      {calc.commencee && <p className="aide">La semaine est commencée : les jours ne changent plus. Ajouter ou retirer une séance viendra dans une prochaine version.</p>}
    </>
  );
}

/** Le lendemain d'une course ou de sauts, l'app demande les douleurs du matin (section 5). */
function DouleursDuLendemain() {
  const { donnees, aujourdhui, enregistrerResultat } = useDonnees();
  const hier = donnees.resultats[ajouterJours(aujourdhui, -1)];
  const zones = hier?.terminee ? douleursDemandees(hier.seance) : [];
  const [notes, setNotes] = useState<Douleurs>({});
  if (!hier || zones.length === 0 || hier.douleursLendemain) return null;
  return (
    <section className="carte">
      <h2>Ce matin, comment ça va ?</h2>
      <p className="aide">Après la séance d'hier. 0 = aucune douleur, 10 = très forte.</p>
      {zones.map((z) => (
        <Echelle key={z} label={LIBELLES_DOULEURS[z]} valeur={notes[z]} onChange={(v) => setNotes((n) => ({ ...n, [z]: v }))} />
      ))}
      <div className="actions">
        <button
          type="button"
          className="principal"
          disabled={zones.some((z) => notes[z] === undefined)}
          onClick={() => enregistrerResultat({ ...hier, douleursLendemain: notes, modifieLe: new Date().toISOString() })}
        >
          Enregistrer
        </button>
      </div>
    </section>
  );
}
