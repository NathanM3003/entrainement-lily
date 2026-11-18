import { useMemo } from 'react';
import { lieuxSeance } from '../moteur/contenu';
import { iconeSeance } from '../moteur/semaine';
import { ajouterJours, dateCourte, joursEntre } from '../moteur/dates';
import { calculerSuivi, etatDuPlan } from '../stockage/suivi';
import { BilanSemaine } from './BilanSemaine';
import { jourCourt, jourEtDate, majuscule } from './communs';
import { useDonnees } from './donnees';

const NOMBRE = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 0 });

/** Accueil : la séance du jour, la semaine en un coup d'œil, et comment va le plan. */
export function EcranAccueil() {
  const { saison, donnees, aujourdhui, cal, basculerRoutine } = useDonnees();
  const plan = useMemo(() => etatDuPlan(saison, donnees, aujourdhui, cal.config.echeance), [saison, donnees, aujourdhui, cal.config.echeance]);
  const suivi = useMemo(() => calculerSuivi(saison, donnees, aujourdhui), [saison, donnees, aujourdhui]);
  const semaine = saison[plan.semaine - 1];
  const vus = new Set(donnees.preferences.badgesVus ?? []);
  const nouveaux = suivi.badges.filter((b) => b.date && !vus.has(b.id));
  const duJour = semaine?.seances.find((s) => s.seance.date === aujourdhui);
  const prochaine = saison.flatMap((s) => s.seances).find((s) => s.seance.date > aujourdhui && s.etat === 'a-faire');
  const matchDuJour = semaine?.plan?.matchs.find((m) => m.date === aujourdhui);
  const avantDebut = aujourdhui < cal.config.debut;

  return (
    <main className="page">
      <p className="surtitre">
        {cal.config.nom} · semaine {plan.semaine} sur {plan.totalSemaines} · {plan.phase}
      </p>
      <h1>{avantDebut ? `Début le ${dateCourte(cal.config.debut)}` : `${majuscule(jourEtDate(aujourdhui))}`}</h1>
      <p className="aide">
        {plan.joursAvantEcheance} jour{plan.joursAvantEcheance > 1 ? 's' : ''} avant : {cal.config.echeanceNom.toLowerCase()} ({dateCourte(cal.config.echeance)}).
      </p>

      {nouveaux.length > 0 && (
        <p className="bandeau">
          ★ {nouveaux.length === 1 ? `Nouveau badge : ${nouveaux[0]!.nom}` : `${nouveaux.length} nouveaux badges`}. <a href="#/progres">Voir</a>
        </p>
      )}

      <section className="carte aujourdhui-carte">
        <h2>Aujourd'hui</h2>
        {avantDebut && semaine?.choix ? (
          <p>Le programme commence le {jourEtDate(cal.config.debut)} : ta première semaine est prête.</p>
        ) : !semaine?.choix ? (
          <>
            <p>Ta semaine n'est pas encore prévue.</p>
            <div className="actions">
              <a className="bouton principal-lien" href={`#/semaine/${plan.semaine}`}>
                Prévoir ma semaine
              </a>
            </div>
          </>
        ) : duJour ? (
          <a className={`seance etat-${duJour.etat}`} href={`#/seance/${aujourdhui}`}>
            <span className="seance-type" aria-hidden="true">
              {iconeSeance(duJour.seance)}
            </span>
            <span className="seance-texte">
              <strong>{duJour.seance.libelle}</strong>
              <span className="petit">
                {lieuxSeance(duJour.seance.contenu, cal.config.disponibilites?.lieux)} · environ {duJour.seance.contenu.minutes} min{duJour.etat === 'faite' ? ' · faite ✓' : duJour.etat === 'en-cours' ? ' · commencée' : ''}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </a>
        ) : (
          <>
            <p>{matchDuJour ? `🥏 ${matchDuJour.nom} aujourd'hui. Pas de séance.` : "Repos aujourd'hui."}</p>
            {!matchDuJour && (
              <label className="case">
                <input type="checkbox" checked={(donnees.routinesMaison ?? []).includes(aujourdhui)} onChange={() => basculerRoutine(aujourdhui)} />
                Routine maison faite (M1, M7, M3, 10 min)
              </label>
            )}
          </>
        )}
        {prochaine && (
          <p className="aide">
            Prochaine séance : {jourEtDate(prochaine.seance.date)}, {prochaine.seance.libelle.toLowerCase()}.
          </p>
        )}
      </section>

      {semaine?.choix && (
        <a className="bande-semaine" href={`#/semaine/${plan.semaine}`} aria-label="Voir le détail de la semaine">
          {joursEntre(semaine.semaine.debut, semaine.semaine.fin).map((j) => {
            const s = semaine.seances.find((x) => x.seance.date === j);
            const m = semaine.plan?.matchs.find((x) => x.date === j);
            return (
              <span key={j} className={`jour-mini${j === aujourdhui ? ' aujourdhui' : ''}${s?.etat === 'faite' ? ' fait' : ''}`}>
                <span className="petit">{jourCourt(j).split(' ')[0]}</span>
                <strong>{s ? iconeSeance(s.seance) : m ? '🥏' : '·'}</strong>
              </span>
            );
          })}
        </a>
      )}

      {/* Bilan : le dimanche ou dès que la semaine est complète ; le lundi et le mardi, celui de la semaine d'avant. */}
      {semaine?.choix && semaine.seances.length > 0 && (semaine.semaine.fin === aujourdhui || semaine.seances.every((s) => s.etat === 'faite')) ? (
        <BilanSemaine calc={semaine} />
      ) : (
        (() => {
          const avant = saison[plan.semaine - 2];
          const jourDeSemaine = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
          return avant?.choix && (jourDeSemaine === 1 || jourDeSemaine === 2) ? <BilanSemaine calc={avant} titre="Bilan de la semaine dernière" /> : null;
        })()
      )}

      <h2 className="titre-section">Ton plan</h2>
      <section className="tuiles">
        <div className="tuile">
          <span className="tuile-valeur">{plan.regularite === undefined ? '—' : `${plan.regularite} %`}</span>
          <span className="tuile-texte">des séances prévues faites</span>
          <span className="petit">
            {plan.seancesFaites} séance{plan.seancesFaites > 1 ? 's' : ''} faite{plan.seancesFaites > 1 ? 's' : ''}
          </span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{suivi.serie.actuelle}</span>
          <span className="tuile-texte">semaine{suivi.serie.actuelle > 1 ? 's' : ''} de suite</span>
          <span className="petit">Meilleure série : {suivi.serie.meilleure}</span>
        </div>
      </section>
      <div className="progression-plan" aria-label={`Semaine ${plan.semaine} sur ${plan.totalSemaines}`}>
        <span style={{ width: `${Math.min(100, ((plan.semaine - (avantDebut ? 1 : 0)) / plan.totalSemaines) * 100)}%` }} />
      </div>
      {plan.prochainTest && (
        <p className="aide">
          Prochain test : {plan.prochainTest.nom.toLowerCase()}, semaine {plan.prochainTest.semaine}
          {plan.prochainTest.date ? ` (${jourEtDate(plan.prochainTest.date)})` : ''}.
        </p>
      )}
      {plan.seancesFaites > 0 && (
        <p className="aide">
          Déjà {NOMBRE(plan.minutes / 60)} h d'entraînement, {NOMBRE(plan.sprints)} sprints, {NOMBRE(plan.sauts)} sauts et {NOMBRE(plan.tonnage)} kg soulevés.{' '}
          <a href="#/progres">Voir tes progrès</a>
        </p>
      )}
      <p className="aide">
        <a href={`#/semaine/${Math.min(plan.totalSemaines, plan.semaine + 1)}`}>Préparer la semaine prochaine</a> · semaine du {dateCourte(ajouterJours(semaine?.semaine.fin ?? aujourdhui, 1))}
      </p>
    </main>
  );
}
