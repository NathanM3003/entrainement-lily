import { useMemo, useState } from 'react';
import { exercice } from '../donnees/banque';
import { SAISON_2026_2027 } from '../donnees/saison-2026-2027';
import { genererCalendrier } from '../moteur/calendrier';
import { ajouterJours, dateCourte, type DateISO } from '../moteur/dates';
import {
  appliquerMarques,
  creerProgramme,
  EXERCICES_CHARGES_ACTUELLES,
  LIBELLES_ETATS,
  LIBELLES_ZONES,
  marquesDe,
  reponsesDe,
  restrictionsDeSante,
  verifierReponses,
  type Marque,
  type ReponsesProgramme,
} from '../moteur/programme';
import { LIBELLES_PHASES, type EtatSante, type ZoneSante } from '../moteur/types';
import { ChampNombre } from './communs';
import { CalendrierPeint } from './CalendrierPeint';
import { useDonnees } from './donnees';

const ETAPES = ['Ton programme', 'Ton calendrier', 'Tes blessures', 'Ton niveau', 'Résumé'] as const;

const COURSES = [
  '5 × (3 min de course + 1 min de marche), ou moins',
  '5 × (4 min + 1 min de marche)',
  '4 × (6 min + 1 min de marche)',
  '2 × 12 min',
  '20 min en continu',
  '25 min en continu',
  '30 min en continu',
];

const NOMS_TESTS = { journee1: 'Tests de la journée 1', sprint: 'Test de sprint', mini: 'Mini-retest', cooper: 'Test demi-Cooper' };

/** « 5:30 » ⇄ 330 secondes par km. */
const versTexte = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
const versSecondes = (t: string) => {
  const m = /^(\d{1,2})[:h.,](\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

/**
 * Questionnaire de création (Règles, section 0), en 5 étapes. Sert aussi à modifier le programme suivi :
 * calendrier, blessures, niveau, sans toucher à ses résultats.
 */
export function EcranNouveauProgramme({ mode }: { mode: 'nouveau' | 'modifier' }) {
  const { cal, donnees, programmes, nouveauProgramme, modifierProgramme } = useDonnees();
  const premierProgramme = programmes.length === 0;
  const base = mode === 'modifier' || !premierProgramme ? cal.config : SAISON_2026_2027;
  const [r, setR] = useState<ReponsesProgramme>(() => reponsesDe(base));
  const [marques, setMarques] = useState<Record<DateISO, Marque>>(() => marquesDe(reponsesDe(base)));
  const [etape, setEtape] = useState(0);
  const [unite, setUnite] = useState<'kg' | 'lb'>(() => Object.values(r.chargesActuelles)[0]?.unite ?? 'kg');
  const datesBloquees = mode === 'modifier' && Object.keys(donnees.resultats).length > 0;
  const set = (c: Partial<ReponsesProgramme>) => setR((x) => ({ ...x, ...c }));

  const complet = useMemo(() => appliquerMarques(r, marques), [r, marques]);
  const erreurs = verifierReponses(complet);
  const config = useMemo(() => (erreurs.length ? null : creerProgramme(complet, mode === 'modifier' ? cal.config : base)), [complet, erreurs.length, mode, cal.config, base]);
  const apercu = useMemo(() => (config ? genererCalendrier(config) : null), [config]);
  const restrictions = restrictionsDeSante(r.sante, r.debut);

  async function valider() {
    if (!config) return;
    if (mode === 'modifier') await modifierProgramme(config);
    else await nouveauProgramme(config);
    location.hash = '#/';
  }

  return (
    <main className="page">
      <a className="retour" href={premierProgramme ? '#/' : '#/reglages'}>
        ‹ {premierProgramme ? 'Accueil' : 'Réglages'}
      </a>
      <p className="surtitre">
        {mode === 'modifier' ? 'Modifier mon programme' : 'Nouveau programme'} · {etape + 1} sur {ETAPES.length}
      </p>
      <h1>{ETAPES[etape]}</h1>
      <nav className="segments etapes" aria-label="Étapes">
        {ETAPES.map((e, i) => (
          <button key={e} type="button" aria-pressed={i === etape} aria-label={e} onClick={() => setEtape(i)}>
            {i + 1}
          </button>
        ))}
      </nav>

      <section className="carte">
        {etape === 0 && (
          <>
            <Texte label="Nom du programme" valeur={r.nom} onChange={(v) => set({ nom: v })} />
            {datesBloquees && <p className="aide">Le programme a déjà des séances notées : ses dates ne changent plus. Pour une autre saison, crée un nouveau programme.</p>}
            <DateChamp label="Début du programme" valeur={r.debut} desactive={datesBloquees} onChange={(v) => set({ debut: v })} />
            <DateChamp label="Échéance : début de saison ou tournoi visé" valeur={r.echeance} desactive={datesBloquees} onChange={(v) => set({ echeance: v })} />
            <Texte label="Nom de l'échéance" valeur={r.echeanceNom} onChange={(v) => set({ echeanceNom: v })} />
            <fieldset className="choix">
              <legend>Nombre de séances par semaine, de base</legend>
              <div className="segments">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={r.seancesParSemaine === n} onClick={() => set({ seancesParSemaine: n })}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="aide">Tu pourras le changer chaque semaine.</p>
            </fieldset>
            <fieldset className="choix">
              <legend>Durée maximale d'une séance</legend>
              <div className="segments">
                {[60, 75, 90].map((n) => (
                  <button key={n} type="button" aria-pressed={r.dureeMax === n} onClick={() => set({ dureeMax: n })}>
                    {n === 60 ? '1 h' : n === 75 ? '1 h 15' : '1 h 30'}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {etape === 1 && (
          <CalendrierPeint
            debut={r.debut}
            fin={ajouterJours(r.echeance, -1)}
            marques={marques}
            series={r.matchsReguliers}
            onMarques={setMarques}
            onSeries={(s) => set({ matchsReguliers: s })}
          />
        )}

        {etape === 2 && (
          <>
            <p className="aide">Pour chaque zone, dis comment ça va et, si ce n'est pas encore le cas, quand tu penses être à 100 %.</p>
            {(Object.keys(LIBELLES_ZONES) as ZoneSante[]).map((z) => {
              const etat = r.sante[z]?.etat ?? 'ok';
              const majZone = (c: Partial<{ etat: EtatSante; note?: string; centPourCentLe?: DateISO }>) =>
                set({ sante: { ...r.sante, [z]: { etat, ...r.sante[z], ...c } } });
              return (
                <fieldset key={z} className="choix zone">
                  <legend>{LIBELLES_ZONES[z]}</legend>
                  <div className="segments">
                    {(Object.keys(LIBELLES_ETATS) as EtatSante[]).map((e) => (
                      <button key={e} type="button" aria-pressed={etat === e} onClick={() => majZone({ etat: e })}>
                        {LIBELLES_ETATS[e]}
                      </button>
                    ))}
                  </div>
                  {etat !== 'ok' && (
                    <>
                      <DateChamp label="À 100 % le" valeur={r.sante[z]?.centPourCentLe ?? ''} onChange={(v) => majZone({ centPourCentLe: v || undefined })} />
                      <Texte label="Précisions (facultatif)" valeur={r.sante[z]?.note ?? ''} onChange={(v) => majZone({ note: v })} />
                    </>
                  )}
                </fieldset>
              );
            })}
            <div className="bandeau">
              <strong>Ce que l'app en tire :</strong>{' '}
              {!restrictions.sprint && !restrictions.changementsDeDirectionJusquau
                ? 'aucune restriction : sprint à 100 % et changements de direction dès le début.'
                : [
                    restrictions.sprint && `sprint à 80 % au plus jusqu'au ${dateCourte(restrictions.sprint.jusquau)}`,
                    restrictions.changementsDeDirectionJusquau && `pas de changement de direction jusqu'au ${dateCourte(restrictions.changementsDeDirectionJusquau)}`,
                  ]
                    .filter(Boolean)
                    .join(' ; ')
                    .replace(/\.$/, '') + '. Les exercices concernés se débloquent tout seuls ensuite.'}
            </div>
            <p className="aide">Chevilles ou genoux pas à 100 % : pas de changement de direction jusqu'à la date. Ischios ou tibias : sprint à 80 % jusqu'à la date. Sans date, la zone est seulement notée.</p>
          </>
        )}

        {etape === 3 && (
          <>
            <fieldset className="choix">
              <legend>Ta dernière course faite sans douleur</legend>
              {COURSES.map((c, i) => (
                <label key={c} className="case">
                  <input type="radio" name="course" checked={r.etapeCourse === i + 1} onChange={() => set({ etapeCourse: i + 1 })} />
                  {c}
                </label>
              ))}
            </fieldset>
            <fieldset className="choix">
              <legend>Tes allures connues (min/km)</legend>
              <p className="aide">Elles donnent tes objectifs de course jusqu'au premier test demi-Cooper. Exemple : 6:00.</p>
              <div className="formulaire">
                {(
                  [
                    ['facile', 'Facile'],
                    ['rapide', 'Rapide'],
                    ['tresRapide', 'Très rapide'],
                  ] as const
                ).map(([cle, libelle]) => (
                  <AllureChamp key={cle} label={libelle} valeur={r.alluresConnues[cle]} onChange={(v) => set({ alluresConnues: { ...r.alluresConnues, [cle]: v } })} />
                ))}
              </div>
            </fieldset>
            <fieldset className="choix">
              <legend>Tes charges actuelles (facultatif)</legend>
              <p className="aide">
                Une charge que tu soulèves déjà, et combien de fois. L'app en tire un objectif dès la 1re séance ; les tests de la journée 1 l'ajustent ensuite.
              </p>
              <div className="segments petit-segments" role="group" aria-label="Unité">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={unite === u}
                    onClick={() => {
                      setUnite(u);
                      set({ chargesActuelles: Object.fromEntries(Object.entries(r.chargesActuelles).map(([id, c]) => [id, { ...c, unite: u }])) });
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
              {EXERCICES_CHARGES_ACTUELLES.map((id) => {
                const c = r.chargesActuelles[id];
                const maj = (champ: { charge?: number; reps?: number }) => {
                  const suivant = { ...r.chargesActuelles };
                  const nouveau = { charge: c?.charge ?? 0, reps: c?.reps ?? 8, unite, ...champ };
                  if (!nouveau.charge) delete suivant[id];
                  else suivant[id] = nouveau;
                  set({ chargesActuelles: suivant });
                };
                return (
                  <div key={id} className="ligne-charge">
                    <span>
                      {exercice(id).nom} <span className="petit">({id})</span>
                    </span>
                    <ChampNombre label="Charge" unite={unite} decimal valeur={c?.charge} onChange={(v) => maj({ charge: v })} />
                    <ChampNombre label="Répétitions" valeur={c?.reps} onChange={(v) => maj({ reps: v })} />
                  </div>
                );
              })}
            </fieldset>
          </>
        )}

        {etape === 4 &&
          (erreurs.length ? (
            <ul className="messages">
              {erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            apercu &&
            config && (
              <>
                <p>
                  <strong>{apercu.semaines.length} semaines</strong>, du {dateCourte(r.debut)} au {dateCourte(r.echeance)} ({r.echeanceNom}), {r.seancesParSemaine} séance
                  {r.seancesParSemaine > 1 ? 's' : ''} par semaine de base.
                </p>
                {apercu.avertissements.map((a) => (
                  <p key={a} className="bandeau">
                    {a}
                  </p>
                ))}
                <table className="tableau">
                  <thead>
                    <tr>
                      <th scope="col">Phase</th>
                      <th scope="col">Semaines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set(apercu.semaines.map((s) => s.phase))].map((ph) => {
                      const s = apercu.semaines.filter((x) => x.phase === ph);
                      return (
                        <tr key={ph}>
                          <th scope="row">{LIBELLES_PHASES[ph]}</th>
                          <td>
                            {s.length} (S{s[0]!.numero} à S{s.at(-1)!.numero})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <h2>Ton calendrier</h2>
                <p className="aide">
                  {config.tournois.length} tournoi{config.tournois.length > 1 ? 's' : ''}, {config.matchsReguliers.length} frisbee chaque semaine,{' '}
                  {config.matchsPonctuels?.length ?? 0} jour{(config.matchsPonctuels?.length ?? 0) > 1 ? 's' : ''} de frisbee de plus, {config.indisponibles?.length ?? 0} jour
                  {(config.indisponibles?.length ?? 0) > 1 ? 's' : ''} indisponible{(config.indisponibles?.length ?? 0) > 1 ? 's' : ''}, semaines légères :{' '}
                  {apercu.semaines
                    .filter((s) => s.legere?.etendue === 'complete')
                    .map((s) => `S${s.numero}`)
                    .join(', ') || 'aucune'}
                  .
                </p>
                <h2>Tests prévus</h2>
                <ul className="liste-reglages">
                  {config.retests.map((t, i) => (
                    <li key={i}>
                      S{t.semaine}
                      {t.jusquaSemaine ? ` à S${t.jusquaSemaine}` : ''} : {NOMS_TESTS[t.type]}
                      {t.moment === 'condition' ? ' (dès que tu cours 20 min sans douleur)' : ''}
                      {t.final ? ' (retest final)' : ''}
                    </li>
                  ))}
                </ul>
                <p className="aide">
                  Les statuts des exercices (validé, à essayer, exclu) sont repris. Tu peux les revoir dans l'écran <a href="#/exercices">Exercices</a>.
                </p>
                <div className="actions">
                  <button type="button" className="principal" onClick={valider}>
                    {mode === 'modifier' ? 'Enregistrer les changements' : 'Créer ce programme'}
                  </button>
                </div>
                {mode === 'nouveau' && !premierProgramme && (
                  <p className="aide">Ton programme actuel est gardé : tu pourras revenir dessus dans Réglages, « Mes programmes ».</p>
                )}
              </>
            )
          ))}
      </section>

      <div className="actions">
        {etape > 0 && (
          <button type="button" onClick={() => setEtape(etape - 1)}>
            Précédent
          </button>
        )}
        {etape < ETAPES.length - 1 && (
          <button type="button" className="principal" onClick={() => setEtape(etape + 1)}>
            Suivant
          </button>
        )}
      </div>
    </main>
  );
}

function Texte({ label, valeur, onChange }: { label: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <label className="champ champ-texte">
      <span className="champ-label">{label}</span>
      <input type="text" value={valeur} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DateChamp({ label, valeur, onChange, desactive }: { label: string; valeur: DateISO; onChange: (v: DateISO) => void; desactive?: boolean }) {
  return (
    <label className="champ champ-texte">
      <span className="champ-label">{label}</span>
      <input type="date" value={valeur} disabled={desactive} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function AllureChamp({ label, valeur, onChange }: { label: string; valeur?: number; onChange: (v?: number) => void }) {
  const [texte, setTexte] = useState(versTexte(valeur));
  return (
    <label className="champ">
      <span className="champ-label">{label}</span>
      <span className="champ-saisie">
        <input
          type="text"
          inputMode="numeric"
          placeholder="6:00"
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            onChange(versSecondes(e.target.value));
          }}
        />
        <span className="champ-unite">min/km</span>
      </span>
    </label>
  );
}
