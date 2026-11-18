import { useState } from 'react';
import { exercice } from '../donnees/banque';
import { texteDosage, texteDuree, type Bloc, type Prescription } from '../moteur/contenu';
import { chargePrevue, maximumEstime } from '../moteur/progression';
import type { Phase } from '../moteur/types';
import {
  avecCharge,
  cleExercice,
  convertirCharge,
  distanceCooper,
  douleursDemandees,
  genreSaisie,
  LIBELLES_DOULEURS,
  distanceEffort,
  nomExercice,
  preremplir,
  TESTS_CHARGE,
  texteAllure,
  texteCharge,
  texteVitesse,
} from '../stockage/saisie';
import type { Decision, Donnees, RaisonPasFait, ResultatExercice, ResultatSeance, Unite } from '../stockage/types';
import { ChampNombre, Echelle, Illustration, jourEtDate, majuscule, useIllustrations } from './communs';
import { useDonnees } from './donnees';

const NOMS_TYPES = { A: 'Séance A', B: 'Séance B', C: 'Séance C', D: 'Séance D', U: 'Séance unique' };

export function EcranSeance({ date }: { date: string }) {
  const { saison, donnees, cal, enregistrerResultat, supprimerResultat } = useDonnees();
  const illustrations = useIllustrations();
  const semaine = saison.find((s) => s.seances.some((x) => x.seance.date === date));
  const affichee = semaine?.seances.find((x) => x.seance.date === date);
  if (!semaine || !affichee) {
    return (
      <main className="page">
        <p>Pas de séance prévue ce jour-là.</p>
        <a href="#/">Retour à la semaine</a>
      </main>
    );
  }
  const { seance } = affichee;
  const resultat = affichee.resultat;
  const phase = semaine.semaine.phase;

  /** Toute modification crée la saisie (avec le contenu figé) ou la met à jour. */
  const modifier = (changement: (r: ResultatSeance) => ResultatSeance) => {
    const base: ResultatSeance = resultat ?? {
      date,
      semaine: semaine.semaine.numero,
      seance,
      exercices: {},
      terminee: false,
      modifieLe: '',
    };
    enregistrerResultat({ ...changement(base), modifieLe: new Date().toISOString() });
  };

  const valeur = (bloc: Bloc, p: Prescription): ResultatExercice => {
    const enregistre = resultat?.exercices[cleExercice(bloc.type, p)];
    if (enregistre) return enregistre;
    const prevue = chargePrevue(cal, donnees, date, phase, p);
    const prerempli = preremplir(bloc.type, p, prevue);
    const prefere = donnees.preferences.unites[p.id.replace(/^T-/, '')];
    if (prefere && prerempli.unite && !prevue) prerempli.unite = prefere;
    return prerempli;
  };

  /** En terminant, ce qui n'a pas été modifié est enregistré tel que prévu : la progression en a besoin. */
  const completer = (r: ResultatSeance): ResultatSeance => {
    const exercices = { ...r.exercices };
    for (const bloc of seance.contenu.blocs) {
      if (bloc.type === 'echauffement') continue;
      for (const p of bloc.exercices) exercices[cleExercice(bloc.type, p)] ??= valeur(bloc, p);
    }
    return { ...r, exercices };
  };

  const changerExercice = (bloc: Bloc, p: Prescription, r: ResultatExercice) =>
    modifier((x) => ({ ...x, exercices: { ...x.exercices, [cleExercice(bloc.type, p)]: r } }));

  const zones = douleursDemandees(seance);
  const fini = resultat?.terminee ?? false;

  return (
    <main className="page">
      <a className="retour" href={`#/semaine/${semaine.semaine.numero}`}>
        ‹ Semaine {semaine.semaine.numero}
      </a>
      <p className="surtitre">
        {majuscule(jourEtDate(date))} · {NOMS_TYPES[seance.type]}
      </p>
      <h1>{seance.libelle}</h1>
      <p className="aide">
        Environ {seance.contenu.minutes} min ({texteDuree(seance.dureeMax)} au plus)
        {seance.courte && ' · version courte, sans record'}
      </p>
      {(seance.contenu.messages.length > 0 || affichee.etat === 'manquee') && (
        <ul className="messages">
          {affichee.etat === 'manquee' && <li>Cette séance est passée. Pas de rattrapage : tu peux quand même la noter si tu l'as faite.</li>}
          {seance.contenu.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {seance.contenu.blocs.map((bloc) => (
        <section key={bloc.type} className="bloc">
          <h2>
            {bloc.titre} <span className="petit">{bloc.minutes} min</span>
          </h2>
          {bloc.type === 'echauffement' ? (
            <Echauffement bloc={bloc} illustrations={illustrations} />
          ) : (
            <ul className="fiches">
              {bloc.exercices.map((p) => (
                <Fiche
                  key={p.id}
                  bloc={bloc}
                  p={p}
                  phase={phase}
                  donnees={donnees}
                  date={date}
                  illustrations={illustrations}
                  valeur={valeur(bloc, p)}
                  prevue={chargePrevue(cal, donnees, date, phase, p)}
                  maximumConnu={maximumEstime(cal, donnees, p.id, date) !== undefined}
                  enregistre={!!resultat?.exercices[cleExercice(bloc.type, p)]}
                  onChange={(r) => changerExercice(bloc, p, r)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="carte fin">
        <h2>Fin de séance</h2>
        <Echelle
          label="Effort de la séance"
          aide="(0 = repos, 10 = maximal)"
          valeur={resultat?.effort}
          onChange={(v) => modifier((r) => ({ ...r, effort: v }))}
        />
        {zones.map((z) => (
          <Echelle
            key={z}
            label={`Douleur : ${LIBELLES_DOULEURS[z].toLowerCase()}`}
            aide="(0 = aucune)"
            valeur={resultat?.douleurs?.[z]}
            onChange={(v) => modifier((r) => ({ ...r, douleurs: { ...r.douleurs, [z]: v } }))}
          />
        ))}
        {(['tibias', 'genou'] as const).some((z) => (resultat?.douleurs?.[z] ?? 0) >= 5) && (
          <p className="aide">Douleur de 5 ou plus : la course recule d'une étape, et la prochaine passe sur vélo ou rameur.</p>
        )}
        {(resultat?.douleurs?.chevilles ?? 0) >= 5 && <p className="aide">Douleur de 5 ou plus aux chevilles : la pliométrie revient au niveau précédent.</p>}
        <div className="actions">
          {fini ? (
            <>
              <p className="ok">Séance terminée ✓</p>
              <button type="button" onClick={() => modifier((r) => ({ ...r, terminee: false }))}>
                Rouvrir
              </button>
            </>
          ) : (
            <button
              type="button"
              className="principal"
              disabled={resultat?.effort === undefined}
              onClick={() => {
                modifier((r) => ({ ...completer(r), terminee: true }));
                location.hash = `#/semaine/${semaine.semaine.numero}`;
              }}
            >
              Terminer la séance
            </button>
          )}
          {resultat && !fini && (
            <button
              type="button"
              className="discret"
              onClick={() => confirm('Effacer tout ce qui a été noté pour cette séance ?') && supprimerResultat(date)}
            >
              Tout effacer
            </button>
          )}
        </div>
        {!fini && resultat?.effort === undefined && <p className="aide">Note l'effort pour terminer.</p>}
      </section>
    </main>
  );
}

function Echauffement({ bloc, illustrations }: { bloc: Bloc; illustrations: Record<string, string> }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  return (
    <ul className="liste-echauffement">
      {bloc.exercices.map((p) => (
        <li key={p.id + p.nom}>
          <button type="button" className="ligne" aria-expanded={ouvert === p.id} onClick={() => setOuvert(ouvert === p.id ? null : p.id)}>
            <span>{nomExercice(p)}</span>
            <span className="petit">
              {texteDosage(p)}
              {p.intensite ? ` · ${p.intensite} %` : ''}
            </span>
          </button>
          {ouvert === p.id && <Illustration id={p.illustration} nom={nomExercice(p)} illustrations={illustrations} />}
        </li>
      ))}
    </ul>
  );
}

const RAISONS: Record<RaisonPasFait, string> = { temps: 'Pas le temps', materiel: 'Matériel pris', douleur: 'Douleur', autre: 'Autre' };
const DECISIONS: Record<Decision, string> = { garde: 'Je garde', refuse: 'Je ne garde pas', reessai: 'Je réessaie une fois' };

function Fiche({
  bloc,
  p,
  phase,
  donnees,
  date,
  illustrations,
  valeur,
  enregistre,
  onChange,
  prevue,
  maximumConnu,
}: {
  prevue?: ReturnType<typeof chargePrevue>;
  maximumConnu: boolean;
  bloc: Bloc;
  p: Prescription;
  phase: Phase;
  donnees: Donnees;
  date: string;
  illustrations: Record<string, string>;
  valeur: ResultatExercice;
  enregistre: boolean;
  onChange: (r: ResultatExercice) => void;
}) {
  const { modifierPreferences } = useDonnees();
  const [details, setDetails] = useState(false);
  const [raisons, setRaisons] = useState(false);
  const banque = p.id.startsWith('T-') ? null : exercice(p.id);
  const nom = nomExercice(p);
  const genre = genreSaisie(bloc.type, p);

  const consignes: string[] = [];
  if (prevue) {
    consignes.push(`Charge prévue : ${texteCharge(prevue.charge, prevue.unite)}${prevue.reps ? `, ${prevue.reps} répétitions` : ''}. ${prevue.explication}`);
  } else if (p.pourcentage1RM && !maximumConnu) {
    consignes.push(`Charge : ${p.pourcentage1RM} % de ton maximum. Elle sera calculée après les tests de la journée 1 : d'ici là, prends une charge qui te laisse 2 ou 3 répétitions en réserve.`);
  } else if (genre === 'series' && avecCharge(p) && !p.note) {
    consignes.push('Première fois : choisis une charge qui te laisse 2 ou 3 répétitions en réserve. L’app la retient pour la suite.');
  }
  if (p.derniereSeriePlus) {
    consignes.push(
      `Dernière série « + » : continue tant qu'il te reste ${phase === 'fondation' ? '2 répétitions' : '1 répétition'} en réserve, et note le nombre fait.`,
    );
  }
  if (p.intensite) consignes.push(`Intensité : ${p.intensite} % au maximum.`);
  const unite = donnees.preferences.allure;
  if (p.vitesseKmh) {
    const effort = { E5: 15, E6: 30, E8: 30 }[p.id as 'E5'];
    consignes.push(
      `Allure : ${texteVitesse(p.vitesseKmh, unite)}${effort ? `, soit environ ${distanceEffort(p.vitesseKmh.min, effort)} m en ${effort} s sur la piste` : ''}.${p.id === 'E7' ? ' 100 % sur les efforts de 15 et 30 s, 95 % sur ceux de 45 et 60 s.' : ''}${p.id === 'E8' ? ' Au moins cette allure.' : ''}`,
    );
    if (p.recuperationKmh) consignes.push(`Récupération trottinée : ${texteVitesse(p.recuperationKmh, unite)} (la marche est permise).`);
  } else if (p.allure) {
    consignes.push(p.role === 'intermittent' && p.pctVMA ? 'Avant le test demi-Cooper : effort de 8 sur 10.' : `${p.allure}.`);
  }
  if (p.serieEnPlus) {
    consignes.push(`1 série de plus du côté ${p.serieEnPlus.cote} (écart de ${p.serieEnPlus.ecart} % au dernier test).`);
  }
  if (p.note) consignes.push(p.note);

  return (
    <li className={`fiche${valeur.pasFait ? ' pas-fait' : ''}${p.essai ? ' essai' : ''}`}>
      <Illustration id={p.illustration} nom={nom} illustrations={illustrations} />
      <div className="fiche-corps">
        <p className="fiche-meta">
          {!p.id.startsWith('T-') && <span className="numero">{p.id}</span>}
          {p.essai && (
            <span className="etiquette">
              À essayer{p.essai.remplacement ? ` · sinon ${p.essai.remplacement} ${exercice(p.essai.remplacement).nom}` : ''}
            </span>
          )}
        </p>
        <h3>{nom}</h3>
        <p className="dosage">{texteDosage(p)}</p>
        {consignes.map((c) => (
          <p key={c} className="consigne">
            {c}
          </p>
        ))}

        {banque && (
          <button type="button" className="lien" aria-expanded={details} onClick={() => setDetails(!details)}>
            {details ? 'Moins de détails' : 'Comment faire'}
          </button>
        )}
        {details && banque && (
          <div className="details">
            <p>{banque.description}</p>
            {banque.pourLeFrisbee && <p className="aide">Pour le frisbee : {banque.pourLeFrisbee}</p>}
            <dl>
              <dt>Matériel</dt>
              <dd>{banque.materiel}</dd>
              <dt>Plus facile</dt>
              <dd>{banque.plusFacile}</dd>
              <dt>Plus difficile</dt>
              <dd>{banque.plusDifficile}</dd>
            </dl>
            {banque.video && (
              <a href={banque.video} target="_blank" rel="noopener noreferrer">
                Voir une démonstration vidéo
              </a>
            )}
          </div>
        )}

        {valeur.pasFait ? (
          <div className="saisie">
            <p className="ok">
              Pas fait : {RAISONS[valeur.pasFait.raison].toLowerCase()}
              {valeur.pasFait.versionPlusFacile ? ' (remplacé par la version plus facile)' : ''}
            </p>
            {valeur.pasFait.raison === 'materiel' && banque && (
              <label className="case">
                <input
                  type="checkbox"
                  checked={!!valeur.pasFait.versionPlusFacile}
                  onChange={(e) => onChange({ ...valeur, pasFait: { raison: 'materiel', versionPlusFacile: e.target.checked } })}
                />
                Je l'ai remplacé par la version plus facile : {banque.plusFacile}
              </label>
            )}
            {valeur.pasFait.raison === 'douleur' && <p className="aide">Noté. Pense aussi à la note de douleur en fin de séance.</p>}
            <button type="button" onClick={() => onChange({ ...valeur, pasFait: undefined })}>
              Finalement, c'est fait
            </button>
          </div>
        ) : (
          <div className="saisie">
            <Saisie genre={genre} p={p} valeur={valeur} onChange={onChange} onUnite={(u) => modifierPreferences({ unites: { ...donnees.preferences.unites, [p.id.replace(/^T-/, '')]: u } })} />
            {p.essai && (
              <fieldset className="choix">
                <legend>Après l'essai</legend>
                <div className="segments">
                  {(Object.keys(DECISIONS) as Decision[]).map((d) => (
                    <button key={d} type="button" aria-pressed={valeur.decision === d} onClick={() => onChange({ ...valeur, decision: d })}>
                      {DECISIONS[d]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {raisons ? (
              <div className="segments raisons">
                {(Object.keys(RAISONS) as RaisonPasFait[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onChange({ ...valeur, pasFait: { raison: r } });
                      setRaisons(false);
                    }}
                  >
                    {RAISONS[r]}
                  </button>
                ))}
                <button type="button" className="discret" onClick={() => setRaisons(false)}>
                  Annuler
                </button>
              </div>
            ) : (
              <div className="fiche-actions">
                <button type="button" className="discret" onClick={() => setRaisons(true)}>
                  Pas fait
                </button>
                {genre !== 'case' && genre !== 'test' && !enregistre && <span className="petit">Prérempli avec ce qui était prévu</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function SelecteurUnite({ unite, onChange }: { unite: Unite; onChange: (u: Unite) => void }) {
  return (
    <div className="segments petit-segments" role="group" aria-label="Unité de charge">
      {(['kg', 'lb'] as Unite[]).map((u) => (
        <button key={u} type="button" aria-pressed={unite === u} onClick={() => onChange(u)}>
          {u}
        </button>
      ))}
    </div>
  );
}

function Saisie({
  genre,
  p,
  valeur,
  onChange,
  onUnite,
}: {
  genre: ReturnType<typeof genreSaisie>;
  p: Prescription;
  valeur: ResultatExercice;
  onChange: (r: ResultatExercice) => void;
  onUnite: (u: Unite) => void;
}) {
  const { donnees } = useDonnees();
  const set = (champ: Partial<ResultatExercice>) => onChange({ ...valeur, ...champ });
  const unite = valeur.unite ?? 'kg';
  const changerUnite = (u: Unite) => {
    // Les charges déjà entrées sont converties.
    const series = valeur.series?.map((s) => (s.charge === undefined ? s : { ...s, charge: convertirCharge(s.charge, unite, u) }));
    const conv = (v: number | undefined) => (v === undefined ? v : convertirCharge(v, unite, u));
    const m = valeur.mesure;
    const mesure = m && TESTS_CHARGE.has(p.id) ? { valeur: conv(m.valeur), gauche: conv(m.gauche), droite: conv(m.droite) } : m;
    onChange({ ...valeur, unite: u, series, mesure });
    onUnite(u);
  };

  switch (genre) {
    case 'series': {
      const series = valeur.series ?? [];
      const charge = avecCharge(p);
      // Une charge changée se recopie sur les séries suivantes qui avaient la même charge : on ne la tape qu'une fois.
      const changerSerie = (i: number, champ: Partial<NonNullable<ResultatExercice['series']>[number]>) => {
        const ancienne = series[i]?.charge;
        set({
          series: series.map((s, j) =>
            j === i ? { ...s, ...champ } : j > i && 'charge' in champ && s.charge === ancienne ? { ...s, charge: champ.charge } : s,
          ),
        });
      };
      return (
        <>
          {charge && <SelecteurUnite unite={unite} onChange={changerUnite} />}
          <ol className="series">
            {series.map((s, i) => (
              <li key={i}>
                <span className="serie-num">Série {i + 1}{p.derniereSeriePlus && i === series.length - 1 ? ' +' : ''}</span>
                {p.secondes ? (
                  <ChampNombre label="Durée" unite="s" valeur={s.secondes} onChange={(v) => changerSerie(i, { secondes: v })} />
                ) : (
                  <ChampNombre label={p.parCote ? 'Rép. par côté' : 'Rép.'} valeur={s.reps} onChange={(v) => changerSerie(i, { reps: v })} />
                )}
                {charge && <ChampNombre label="Charge" unite={unite} decimal valeur={s.charge} onChange={(v) => changerSerie(i, { charge: v })} />}
              </li>
            ))}
          </ol>
          {charge && series.some((s) => s.charge) && (
            <p className="petit">Dernière série : {texteCharge(series.at(-1)?.charge ?? 0, unite)}</p>
          )}
          <div className="fiche-actions">
            <button type="button" className="discret" onClick={() => set({ series: [...series, { ...(series.at(-1) ?? {}) }] })}>
              + Une série
            </button>
            {series.length > 1 && (
              <button type="button" className="discret" onClick={() => set({ series: series.slice(0, -1) })}>
                − Une série
              </button>
            )}
          </div>
        </>
      );
    }
    case 'sprints':
      return (
        <div className="champs">
          <ChampNombre label="Sprints faits" valeur={valeur.nombre} onChange={(v) => set({ nombre: v })} />
          <ChampNombre label="Distance" unite="m" valeur={valeur.distance} onChange={(v) => set({ distance: v })} />
          <ChampNombre label="Temps filmé (facultatif)" unite="s" decimal valeur={valeur.temps} onChange={(v) => set({ temps: v })} />
          <label className="case">
            <input type="checkbox" checked={!!valeur.tension} onChange={(e) => set({ tension: e.target.checked })} />
            Tension derrière la cuisse ou le genou : j'ai arrêté les sprints
          </label>
          {valeur.tension && <p className="aide">Arrête les sprints pour aujourd'hui. Pendant 1 semaine : pas de V3 ni de vitesse maximale, mais F10 et M10 restent.</p>}
        </div>
      );
    case 'sauts':
      return (
        <div className="champs">
          <ChampNombre label={p.unite ? `${p.unite[0]!.toUpperCase()}${p.unite.slice(1)} faits` : 'Sauts faits'} valeur={valeur.nombre} onChange={(v) => set({ nombre: v })} />
          {p.id === 'P4' && <ChampNombre label="Hauteur de boîte" unite="cm" valeur={valeur.hauteur} onChange={(v) => set({ hauteur: v })} />}
          {p.id === 'P5' && <ChampNombre label="Meilleur saut" unite="cm" valeur={valeur.distance} onChange={(v) => set({ distance: v })} />}
        </div>
      );
    case 'efforts':
      return (
        <div className="champs">
          <ChampNombre label={p.id === 'E7' ? 'Pyramides faites' : 'Efforts faits'} valeur={valeur.nombre} onChange={(v) => set({ nombre: v })} />
          {p.id === 'E8' && <ChampNombre label="Distance totale" unite="m" valeur={valeur.distance} onChange={(v) => set({ distance: v })} />}
          {p.pctVMA && (
            <fieldset className="choix">
              <legend>Sur la plupart des efforts, j'étais :</legend>
              <div className="segments">
                {(
                  [
                    ['plus-vite', 'Plus vite'],
                    ['prevu', 'Comme prévu'],
                    ['plus-lent', 'Plus lente'],
                  ] as const
                ).map(([v, t]) => (
                  <button key={v} type="button" aria-pressed={(valeur.rythme ?? 'prevu') === v} onClick={() => set({ rythme: v })}>
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      );
    case 'duree': {
      const allure = valeur.minutes && valeur.km ? texteAllure(valeur.minutes, valeur.km, donnees.preferences.allure) : '';
      return (
        <div className="champs">
          <ChampNombre label="Durée" unite="min" valeur={valeur.minutes} onChange={(v) => set({ minutes: v })} />
          {p.role === 'course' && <ChampNombre label="Distance (facultatif)" unite="km" decimal valeur={valeur.km} onChange={(v) => set({ km: v })} />}
          {allure && <p className="petit">Allure : {allure}</p>}
        </div>
      );
    }
    case 'test':
      return <SaisieTest p={p} valeur={valeur} set={set} unite={unite} changerUnite={changerUnite} />;
    case 'case':
      return null;
  }
}

function SaisieTest({
  p,
  valeur,
  set,
  unite,
  changerUnite,
}: {
  p: Prescription;
  valeur: ResultatExercice;
  set: (c: Partial<ResultatExercice>) => void;
  unite: Unite;
  changerUnite: (u: Unite) => void;
}) {
  const mesure = valeur.mesure ?? {};
  const setMesure = (c: Partial<NonNullable<ResultatExercice['mesure']>>) => set({ mesure: { ...mesure, ...c } });
  if (p.id === 'T-cooper') {
    const c = valeur.cooper ?? {};
    return (
      <div className="champs">
        <ChampNombre label="Tours complets (460 m)" valeur={c.tours} onChange={(v) => set({ cooper: { ...c, tours: v } })} />
        <ChampNombre label="Dernier tour partiel" unite="m" valeur={c.reste} onChange={(v) => set({ cooper: { ...c, reste: v } })} />
        {c.tours !== undefined && (
          <p className="petit">
            Distance : {distanceCooper(c.tours, c.reste)} m · VMA environ {(distanceCooper(c.tours, c.reste) / 100).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km/h
          </p>
        )}
      </div>
    );
  }
  const charge = TESTS_CHARGE.has(p.id);
  const libelleUnite = charge ? unite : p.mesure;
  const decimal = p.mesure === 's' || charge;
  return (
    <>
      {charge && <SelecteurUnite unite={unite} onChange={changerUnite} />}
      <div className="champs">
        {p.parCote ? (
          <>
            <ChampNombre label="Gauche" unite={libelleUnite} decimal={decimal} valeur={mesure.gauche} onChange={(v) => setMesure({ gauche: v })} />
            <ChampNombre label="Droite" unite={libelleUnite} decimal={decimal} valeur={mesure.droite} onChange={(v) => setMesure({ droite: v })} />
          </>
        ) : (
          <ChampNombre label={p.mesure === 's' ? 'Meilleur temps' : 'Résultat'} unite={libelleUnite} decimal={decimal} valeur={mesure.valeur} onChange={(v) => setMesure({ valeur: v })} />
        )}
      </div>
      {charge && mesure.valeur !== undefined && <p className="petit">{texteCharge(mesure.valeur, unite)}</p>}
    </>
  );
}
