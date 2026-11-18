import { useState } from 'react';
import { exercice } from '../donnees/banque';
import { lieuxSeance, ROUTINE_AVANT_MATCH } from '../moteur/contenu';
import { iconeSeance } from '../moteur/semaine';
import { BilanSemaine } from './BilanSemaine';
import { ajouterJours, dateCourte, joursEntre, jourSemaine, type DateISO } from '../moteur/dates';
import type { ChoixSemaine, LieuSeance } from '../moteur/semaine';
import { LIBELLES_PHASES, type Semaine } from '../moteur/types';
import { douleursDemandees, LIBELLES_DOULEURS } from '../stockage/saisie';
import { calculerSuivi } from '../stockage/suivi';
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

const NOMS_TESTS = { journee1: 'Tests de la journée 1', sprint: 'Test de sprint', mini: 'Mini-retest', cooper: 'Test demi-Cooper' };

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
    if (r.moment === 'condition') liste.push('Test demi-Cooper possible dès que tu cours 20 min sans douleur');
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


      <NouveauxBadges />

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
          aujourdhui={aujourdhui}
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
  aujourdhui,
  onValider,
  onAnnuler,
}: {
  calc: SemaineCalculee;
  precedent?: ChoixSemaine;
  aujourdhui: DateISO;
  onValider: (c: ChoixSemaine) => void;
  onAnnuler?: () => void;
}) {
  const jours = joursEntre(calc.semaine.debut, calc.semaine.fin);
  const enCours = calc.semaine.debut <= aujourdhui && aujourdhui <= calc.semaine.fin;
  const faites = calc.seances.filter((s) => s.resultat).map((s) => s.seance.date);
  // Par défaut : le choix déjà fait, sinon les mêmes jours de la semaine que la semaine d'avant, sinon tous les jours.
  const { cal } = useDonnees();
  const indispos = new Set(cal.config.indisponibles ?? []);
  const joursParDefaut = (): DateISO[] => {
    if (calc.choix) return calc.choix.joursDisponibles;
    // Jours marqués « indisponible » sur le calendrier du programme : décochés d'office.
    const libres = jours.filter((j) => !indispos.has(j));
    if (precedent) {
      const jds = new Set(precedent.joursDisponibles.map(jourSemaine));
      const memes = libres.filter((j) => jds.has(jourSemaine(j)));
      if (memes.length) return memes;
    }
    return libres;
  };
  const [nb, setNb] = useState(Math.max(calc.choix?.nbSeances ?? precedent?.nbSeances ?? cal.config.disponibilites?.seancesParSemaine ?? 3, faites.length));
  const [dispo, setDispo] = useState<DateISO[]>(joursParDefaut);
  const basculer = (j: DateISO) => setDispo((d) => (d.includes(j) ? d.filter((x) => x !== j) : [...d, j].sort()));
  // Lieu possible chaque jour : gym, piste, ou les deux (par défaut : comme le même jour de la semaine d'avant).
  const [lieux, setLieux] = useState<Record<DateISO, LieuSeance>>(() => {
    if (calc.choix) return calc.choix.lieux ?? {};
    const avant = precedent?.lieux ?? {};
    const parJour = new Map(Object.entries(avant).map(([d, l]) => [jourSemaine(d), l]));
    return Object.fromEntries(jours.filter((j) => parJour.has(jourSemaine(j))).map((j) => [j, parJour.get(jourSemaine(j))!]));
  });
  const choisirLieu = (j: DateISO, l?: LieuSeance) =>
    setLieux((x) => {
      const suivant = { ...x };
      if (l) suivant[j] = l;
      else delete suivant[j];
      return suivant;
    });
  // Conseil de la semaine : 1 séance sur la piste, les autres au gym (une seule séance : piste et gym en alternance).
  const conseil =
    nb === 1
      ? `1 séance, ${calc.semaine.numero % 2 === 1 ? 'sur la piste' : 'au gym'} cette semaine (piste et gym en alternance)`
      : `1 séance sur la piste et ${nb - 1} au gym`;
  const passe = (j: DateISO) => enCours && j < aujourdhui;

  // Matchs : les matchs réguliers sont cochés d'office ; Lily en ajoute (match imprévu) ou en annule.
  const reguliers = calc.semaine.evenements.filter((e) => e.type === 'match').map((e) => e.date);
  const tournoi = new Set(calc.semaine.evenements.filter((e) => e.type === 'tournoi').map((e) => e.date));
  const [matchs, setMatchs] = useState<DateISO[]>(() => [
    ...reguliers.filter((d) => !(calc.choix?.matchsAnnules ?? []).includes(d)),
    ...(calc.choix?.matchsSupplementaires ?? []),
  ]);
  const basculerMatch = (j: DateISO) => setMatchs((m) => (m.includes(j) ? m.filter((x) => x !== j) : [...m, j]));

  const valider = () =>
    onValider({
      nbSeances: nb,
      joursDisponibles: dispo,
      matchsSupplementaires: matchs.filter((d) => !reguliers.includes(d)).sort(),
      matchsAnnules: reguliers.filter((d) => !matchs.includes(d)),
      // Semaine en cours : rien n'est placé avant aujourd'hui, et les séances faites restent.
      ...(enCours ? { depuis: aujourdhui } : {}),
      ...(calc.choix?.express?.length ? { express: calc.choix.express } : {}),
      ...(Object.keys(lieux).some((j) => dispo.includes(j)) ? { lieux: Object.fromEntries(Object.entries(lieux).filter(([j]) => dispo.includes(j))) } : {}),
    });

  return (
    <section className="carte">
      <h2>Ta semaine</h2>
      {faites.length > 0 && <p className="aide">Les séances déjà faites restent à leur place. L'app replace les autres à partir d'aujourd'hui.</p>}
      <fieldset className="choix">
        <legend>Combien de séances cette semaine ?</legend>
        <div className="segments">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" aria-pressed={nb === n} disabled={n < faites.length} onClick={() => setNb(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choix">
        <legend>Quels jours es-tu disponible ?</legend>
        <div className="jours">
          {jours.map((j) => (
            <button key={j} type="button" aria-pressed={dispo.includes(j) && !passe(j)} disabled={passe(j) || faites.includes(j)} onClick={() => basculer(j)}>
              {jourCourt(j)}
              {(matchs.includes(j) || tournoi.has(j)) && <span className="petit">{tournoi.has(j) ? 'tournoi' : 'match'}</span>}
              {indispos.has(j) && !matchs.includes(j) && !tournoi.has(j) && <span className="petit">indispo</span>}
            </button>
          ))}
        </div>
      </fieldset>
      {dispo.some((j) => !passe(j) && !faites.includes(j)) && (
        <fieldset className="choix">
          <legend>Où peux-tu t'entraîner ces jours-là ?</legend>
          <p className="aide">
            Conseillé : {conseil}. Le gym n'a pas de piste : les sprints et la musculation ne se font jamais le même jour. Si un jour n'est possible
            qu'à un seul endroit, indique-le : l'app s'adapte.
          </p>
          <ul className="lieux-jours">
            {dispo
              .filter((j) => !passe(j) && !faites.includes(j))
              .map((j) => (
                <li key={j}>
                  <span>{jourCourt(j)}</span>
                  <span className="segments petit-segments" role="group" aria-label={`Lieu possible le ${jourCourt(j)}`}>
                    {([undefined, 'gym', 'piste'] as const).map((l) => (
                      <button key={l ?? 'deux'} type="button" aria-pressed={lieux[j] === l} onClick={() => choisirLieu(j, l)}>
                        {l === 'gym' ? 'Gym' : l === 'piste' ? 'Piste' : 'Les deux'}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        </fieldset>
      )}
      <fieldset className="choix">
        <legend>Matchs cette semaine</legend>
        <p className="aide">Coche un match imprévu, même déjà joué, ou décoche un match annulé. L'app ajuste la semaine.</p>
        <div className="jours">
          {jours.map((j) => (
            <button key={j} type="button" aria-pressed={matchs.includes(j) || tournoi.has(j)} disabled={tournoi.has(j)} onClick={() => basculerMatch(j)}>
              {jourCourt(j)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="aide">Coche seulement les jours où tu veux t'entraîner : l'app place tes séances sur ces jours et choisit le type et le contenu de chacune.</p>
      <div className="actions">
        <button type="button" className="principal" disabled={dispo.filter((j) => !passe(j)).length === 0 && faites.length === 0} onClick={valider}>
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
  const { demanderSemaineLegere, donnees, noterMatch, basculerRoutine, cal } = useDonnees();
  const dejaLegere = calc.semaine.legere?.etendue === 'complete' && !calc.legereDemandee;
  const jours = joursEntre(calc.semaine.debut, calc.semaine.fin);
  const matchs = calc.plan?.matchs ?? [];
  const cod = cal.config.restrictions.changementsDeDirection;
  const routineDes = cod ? ajouterJours(cod.jusquau, 1) : cal.config.debut;
  const lieux = cal.config.disponibilites?.lieux;
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
                <div key={m.nom + m.date} className="match-bloc">
                  <p className="match">
                    {m.type === 'tournoi' ? '🏆' : '🥏'} {m.nom}
                  </p>
                  {j >= aujourdhui && j >= routineDes && (
                    <details className="routine">
                      <summary>Routine d'avant-match proposée (facultative)</summary>
                      <ul>
                        {ROUTINE_AVANT_MATCH.map((id) => (
                          <li key={id}>
                            {exercice(id).nom} <span className="petit">({id})</span>
                          </li>
                        ))}
                      </ul>
                      <p className="aide">Environ 10 min. Si tu as déjà ta routine d'avant-match, garde-la. Mets tes chevillères aux deux chevilles.</p>
                    </details>
                  )}
                  {j <= aujourdhui && (
                    <Echelle
                      label={m.type === 'tournoi' ? 'Effort de la journée' : 'Effort du match'}
                      aide="(0 à 10)"
                      valeur={donnees.notesMatchs?.[j]}
                      onChange={(v) => noterMatch(j, v)}
                    />
                  )}
                </div>
              ))}
              {seance ? (
                <a className={`seance etat-${seance.etat}`} href={`#/seance/${j}`}>
                  <span className="seance-type" aria-hidden="true">
                    {iconeSeance(seance.seance)}
                  </span>
                  <span className="seance-texte">
                    <strong>{seance.seance.libelle}</strong>
                    <span className="petit">
                      {lieuxSeance(seance.seance.contenu, lieux, seance.seance.lieu)} · {donnees.resultats[j]?.duree ? `${donnees.resultats[j]!.duree} min` : `environ ${seance.seance.contenu.minutes} min`} · {ETATS[seance.etat]}
                      {seance.seance.contenu.essais.length > 0 && ' · à essayer'}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              ) : (
                match.length === 0 && <p className="repos">{recup ? 'Récupération : repos ou mobilité' : 'Repos'}</p>
              )}
              {!seance && j <= aujourdhui && j >= calc.semaine.debut && (
                <label className="case">
                  <input type="checkbox" checked={(donnees.routinesMaison ?? []).includes(j)} onChange={() => basculerRoutine(j)} />
                  Routine maison faite (M1, M7, M3)
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <p className="aide">Les jours de repos, une routine facultative de 10 min à la maison : M1, M7 et M3 (sans course).</p>
      {calc.seances.length > 0 && (calc.semaine.fin <= aujourdhui || calc.seances.every((s) => s.etat === 'faite')) && <BilanSemaine calc={calc} />}
      {calc.semaine.fin >= aujourdhui && (
        <div className="actions">
          <button type="button" onClick={onModifier}>
            Changer ma semaine
          </button>
          {!dejaLegere && (
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
      )}
      <p className="aide">
        Changer ma semaine : ajouter ou retirer une séance, changer de jours, déclarer un match imprévu ou annulé. Pour retirer un tournoi ou un frisbee
        régulier : <a href="#/modifier">modifier mon calendrier</a>.
      </p>
    </>
  );
}

/** Badges gagnés depuis la dernière visite de l'écran Progrès. */
function NouveauxBadges() {
  const { saison, donnees, aujourdhui } = useDonnees();
  const vus = new Set(donnees.preferences.badgesVus ?? []);
  const nouveaux = calculerSuivi(saison, donnees, aujourdhui).badges.filter((b) => b.date && !vus.has(b.id));
  if (nouveaux.length === 0) return null;
  return (
    <p className="bandeau">
      ★ {nouveaux.length === 1 ? `Nouveau badge : ${nouveaux[0]!.nom}` : `${nouveaux.length} nouveaux badges`}. <a href="#/progres">Voir</a>
    </p>
  );
}
