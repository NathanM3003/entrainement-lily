import { useEffect, useMemo } from 'react';
import { dateCourte } from '../moteur/dates';
import { calculerSuivi, etatDuPlan, type Badge, type Point } from '../stockage/suivi';
import { useDonnees } from './donnees';
import { Graphique, type SerieGraphique } from './Graphique';

const NOMBRE = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 1 });

/** Plusieurs séries de points sur les mêmes dates (une date par étiquette). */
function aligner(series: { nom: string; points: Point[] }[]): { etiquettes: string[]; series: SerieGraphique[] } {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  return {
    etiquettes: dates.map(dateCourte),
    series: series.map((s) => ({ nom: s.nom, valeurs: dates.map((d) => s.points.find((p) => p.date === d)?.valeur ?? null) })),
  };
}

const CATEGORIES: Record<Badge['categorie'], string> = {
  jalon: 'Jalons',
  regularite: 'Régularité',
  record: 'Records',
  course: 'Course',
  prevention: 'Prévention',
  intermittents: 'Intermittents',
  symetrie: 'Symétrie',
  date: 'Dates clés',
  tournoi: 'Tournois',
};

export function EcranProgres() {
  const { saison, donnees, aujourdhui, modifierPreferences, cal } = useDonnees();
  const suivi = useMemo(() => calculerSuivi(saison, donnees, aujourdhui), [saison, donnees, aujourdhui]);
  const plan = useMemo(() => etatDuPlan(saison, donnees, aujourdhui, cal.config.echeance), [saison, donnees, aujourdhui, cal.config.echeance]);
  // Badges vus avant d'ouvrir l'écran : figés à l'ouverture, pour que les nouveaux restent signalés.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vus = useMemo(() => new Set(donnees.preferences.badgesVus ?? []), []);
  const gagnes = suivi.badges.filter((b) => b.date);

  // En ouvrant cet écran, les nouveaux badges sont vus.
  useEffect(() => {
    const ids = gagnes.map((b) => b.id);
    if (ids.some((id) => !(donnees.preferences.badgesVus ?? []).includes(id))) modifierPreferences({ badgesVus: ids });
  }, [gagnes, donnees.preferences.badgesVus, modifierPreferences]);

  const NOMS_COURTS: Record<string, string> = { F1: 'Squat', F7: 'Squat bulgare', F14: 'Développé', F16: 'Tirage' };
  const force = useMemo(() => aligner(suivi.courbes.force.map((f) => ({ nom: NOMS_COURTS[f.id] ?? f.id, points: f.points }))), [suivi]);
  const sprints = useMemo(() => aligner([{ nom: '10 m', points: suivi.courbes.sprint10 }, { nom: '20 m', points: suivi.courbes.sprint20 }]), [suivi]);
  const saut = useMemo(() => aligner([{ nom: 'Saut en longueur', points: suivi.courbes.saut }]), [suivi]);
  const douleurs = useMemo(
    () =>
      aligner([
        { nom: 'Tibias', points: suivi.courbes.douleurs.tibias },
        { nom: 'Arrière du genou', points: suivi.courbes.douleurs.genou },
        { nom: 'Chevilles', points: suivi.courbes.douleurs.chevilles },
      ]),
    [suivi],
  );
  const course = useMemo(
    () => ({
      etiquettes: suivi.courbes.courseParSemaine.map((c) => `S${c.semaine}`),
      series: [{ nom: 'Course facile', valeurs: suivi.courbes.courseParSemaine.map((c) => c.minutes || null) }],
    }),
    [suivi],
  );

  // Records : un badge par record battu, regroupés ici avec leur nombre.
  const parCategorie = (Object.keys(CATEGORIES) as Badge['categorie'][])
    .filter((c) => c !== 'record')
    .map((c) => ({ c, badges: suivi.badges.filter((b) => b.categorie === c) }))
    .filter((x) => x.badges.length);
  const recordsBattus = suivi.badges.filter((b) => b.categorie === 'record' && b.date).length;

  return (
    <main className="page">
      <p className="surtitre">Ta progression</p>
      <h1>Progrès</h1>

      <section className="tuiles">
        <div className="tuile">
          <span className="tuile-valeur">{suivi.serie.actuelle}</span>
          <span className="tuile-texte">semaine{suivi.serie.actuelle > 1 ? 's' : ''} de suite</span>
          <span className="petit">Meilleure série : {suivi.serie.meilleure}</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{suivi.seancesFaites}</span>
          <span className="tuile-texte">séance{suivi.seancesFaites > 1 ? 's' : ''} faite{suivi.seancesFaites > 1 ? 's' : ''}</span>
          <span className="petit">{recordsBattus} record{recordsBattus > 1 ? 's' : ''} battu{recordsBattus > 1 ? 's' : ''}</span>
        </div>
      </section>
      <p className="aide">Une série compte les semaines où toutes les séances que tu as choisies sont faites. Une semaine légère ou à 1 séance compte aussi.</p>

      <section className="tuiles tuiles-4">
        <div className="tuile">
          <span className="tuile-valeur">{plan.regularite === undefined ? '—' : `${plan.regularite} %`}</span>
          <span className="tuile-texte">régularité</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{NOMBRE(plan.minutes / 60)} h</span>
          <span className="tuile-texte">d'entraînement</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{NOMBRE(plan.sprints)}</span>
          <span className="tuile-texte">sprints</span>
        </div>
        <div className="tuile">
          <span className="tuile-valeur">{NOMBRE(plan.tonnage)}</span>
          <span className="tuile-texte">kg soulevés</span>
        </div>
      </section>
      <p className="aide">
        Semaine {plan.semaine} sur {plan.totalSemaines} ({plan.phase}) · {plan.joursAvantEcheance} jours avant {cal.config.echeanceNom.toLowerCase()} · {NOMBRE(plan.sauts)} sauts.
      </p>

      <a className="seance lien-bilan" href="#/bilan">
        <span className="seance-type">✓</span>
        <span className="seance-texte">
          <strong>Bilan de préparation</strong>
          <span className="petit">Tous tes tests, du premier au dernier</span>
        </span>
        <span aria-hidden="true">›</span>
      </a>

      <h2 className="titre-section">Records</h2>
      {suivi.records.length === 0 ? (
        <p className="aide">Tes records apparaîtront après tes premiers tests et tes premières séances.</p>
      ) : (
        <ul className="records">
          {suivi.records.map((r) => (
            <li key={r.id}>
              <span>{r.nom.charAt(0).toUpperCase() + r.nom.slice(1)}</span>
              <strong>
                {NOMBRE(r.valeur)} {r.unite}
              </strong>
              <span className="petit">
                {dateCourte(r.date)}
                {r.battu > 0 ? ` · battu ${r.battu} fois` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="titre-section">Badges</h2>
      {parCategorie.map(({ c, badges }) => (
        <section key={c} className="badges-categorie">
          <h3>{CATEGORIES[c]}</h3>
          <ul className="badges">
            {badges.map((b) => (
              <li key={b.id} className={b.date ? (vus.has(b.id) ? 'badge gagne' : 'badge gagne nouveau') : 'badge'}>
                <span className="badge-icone" aria-hidden="true">
                  {b.date ? '★' : '☆'}
                </span>
                <span>
                  <strong>{b.nom}</strong>
                  <span className="petit">{b.date ? `${vus.has(b.id) ? '' : 'Nouveau · '}${dateCourte(b.date)}` : b.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2 className="titre-section">Graphiques</h2>
      <Graphique titre="Maximum estimé" etiquettes={force.etiquettes} series={force.series} unite={suivi.courbes.uniteForce} />
      <Graphique titre="Sprints (plus bas = plus rapide)" etiquettes={sprints.etiquettes} series={sprints.series} unite="s" />
      <Graphique titre="Saut en longueur" etiquettes={saut.etiquettes} series={saut.series} unite="cm" />
      <Graphique titre="Course facile par semaine" type="bar" etiquettes={course.etiquettes} series={course.series} unite="min" min={0} />
      <Graphique titre="Douleurs après les séances" etiquettes={douleurs.etiquettes} series={douleurs.series} unite="sur 10" min={0} max={10} />
      {suivi.courbes.cooper.length > 0 && (
        <p className="aide">
          Test demi-Cooper :{' '}
          {suivi.courbes.cooper.map((p) => `${NOMBRE(p.valeur)} m le ${dateCourte(p.date)} (VMA ${NOMBRE(p.valeur / 100)} km/h)`).join(', ')}.
        </p>
      )}
    </main>
  );
}
