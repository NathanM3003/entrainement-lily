import { useMemo, useState } from 'react';
import { genererCalendrier } from '../moteur/calendrier';
import { dateCourte, JOURS, type DateISO, type JourSemaine } from '../moteur/dates';
import {
  creerProgramme,
  LIBELLES_ETATS,
  LIBELLES_LIEUX,
  LIBELLES_ZONES,
  reponsesDe,
  verifierReponses,
  type ReponsesProgramme,
} from '../moteur/programme';
import { LIBELLES_PHASES, type EtatSante, type Lieu, type Periode, type ZoneSante } from '../moteur/types';
import { useDonnees } from './donnees';

const ETAPES = ['Dates', 'Événements', 'Santé', 'Disponibilités', 'Niveau', 'Exercices', 'Résumé'] as const;

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

/** Questionnaire de création d'un programme (Règles, section 0), prérempli avec le programme en cours. */
export function EcranNouveauProgramme() {
  const { cal, nouveauProgramme } = useDonnees();
  const [r, setR] = useState<ReponsesProgramme>(() => reponsesDe(cal.config));
  const [etape, setEtape] = useState(0);
  const set = (c: Partial<ReponsesProgramme>) => setR((x) => ({ ...x, ...c }));
  const erreurs = verifierReponses(r);
  const config = useMemo(() => (erreurs.length ? null : creerProgramme(r, cal.config)), [r, erreurs.length, cal.config]);
  const apercu = useMemo(() => (config ? genererCalendrier(config) : null), [config]);

  async function creer() {
    if (!config) return;
    if (!confirm('Créer ce programme ? La saison en cours (semaines, séances, résultats) sera remplacée. Pense à créer une sauvegarde avant.')) return;
    await nouveauProgramme(config);
    location.hash = '#/';
  }

  return (
    <main className="page">
      <a className="retour" href="#/reglages">
        ‹ Réglages
      </a>
      <p className="surtitre">
        Nouveau programme · {etape + 1} sur {ETAPES.length}
      </p>
      <h1>{ETAPES[etape]}</h1>
      <nav className="segments etapes" aria-label="Étapes du questionnaire">
        {ETAPES.map((e, i) => (
          <button key={e} type="button" aria-pressed={i === etape} onClick={() => setEtape(i)}>
            {i + 1}
          </button>
        ))}
      </nav>

      <section className="carte">
        {etape === 0 && (
          <>
            <Texte label="Nom du programme" valeur={r.nom} onChange={(v) => set({ nom: v })} />
            <DateChamp label="Début du programme" valeur={r.debut} onChange={(v) => set({ debut: v })} />
            <DateChamp label="Échéance (début de saison ou tournoi visé)" valeur={r.echeance} onChange={(v) => set({ echeance: v })} />
            <Texte label="Nom de l'échéance" valeur={r.echeanceNom} onChange={(v) => set({ echeanceNom: v })} />
            <p className="aide">Si le début n'est pas un lundi, les jours avant le premier lundi servent aux tests de la journée 1.</p>
          </>
        )}
        {etape === 1 && (
          <>
            <ListePeriodes titre="Tournois" liste={r.tournois} onChange={(l) => set({ tournois: l })} exemple="Tournoi d'avril" />
            <ListePeriodes titre="Périodes allégées (vacances, fêtes)" liste={r.periodesAllegees} onChange={(l) => set({ periodesAllegees: l })} exemple="Vacances" />
            <h2>Matchs réguliers</h2>
            <ul className="liste-reglages">
              {r.matchsReguliers.map((m, i) => (
                <li key={i}>
                  {m.nom} : le {JOURS[m.jour - 1]}, à partir du {dateCourte(m.debut)}{' '}
                  <button type="button" className="lien" onClick={() => set({ matchsReguliers: r.matchsReguliers.filter((_, j) => j !== i) })}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            <AjoutMatch onAjouter={(m) => set({ matchsReguliers: [...r.matchsReguliers, m] })} />
          </>
        )}
        {etape === 2 && (
          <>
            {(Object.keys(LIBELLES_ZONES) as ZoneSante[]).map((z) => (
              <fieldset key={z} className="choix">
                <legend>{LIBELLES_ZONES[z]}</legend>
                <div className="segments">
                  {(Object.keys(LIBELLES_ETATS) as EtatSante[]).map((e) => (
                    <button key={e} type="button" aria-pressed={(r.sante[z]?.etat ?? 'ok') === e} onClick={() => set({ sante: { ...r.sante, [z]: { ...r.sante[z], etat: e } } })}>
                      {LIBELLES_ETATS[e]}
                    </button>
                  ))}
                </div>
                {(r.sante[z]?.etat ?? 'ok') !== 'ok' && (
                  <Texte label="Précisions" valeur={r.sante[z]?.note ?? ''} onChange={(v) => set({ sante: { ...r.sante, [z]: { etat: r.sante[z]!.etat, note: v } } })} />
                )}
              </fieldset>
            ))}
            <h2>Restrictions datées</h2>
            <label className="case">
              <input type="checkbox" checked={!!r.sprint} onChange={(e) => set({ sprint: e.target.checked ? { intensiteMax: 80, jusquau: r.debut } : undefined })} />
              Sprint limité
            </label>
            {r.sprint && (
              <div className="formulaire">
                <label className="champ">
                  <span className="champ-label">Intensité maximale (%)</span>
                  <input type="number" min={50} max={100} step={5} value={r.sprint.intensiteMax} onChange={(e) => set({ sprint: { ...r.sprint!, intensiteMax: Number(e.target.value) } })} />
                </label>
                <DateChamp label="Jusqu'au (inclus)" valeur={r.sprint.jusquau} onChange={(v) => set({ sprint: { ...r.sprint!, jusquau: v } })} />
              </div>
            )}
            <label className="case">
              <input
                type="checkbox"
                checked={!!r.changementsDeDirectionJusquau}
                onChange={(e) => set({ changementsDeDirectionJusquau: e.target.checked ? r.debut : undefined })}
              />
              Pas de changement de direction
            </label>
            {r.changementsDeDirectionJusquau && (
              <DateChamp label="Jusqu'au (inclus)" valeur={r.changementsDeDirectionJusquau} onChange={(v) => set({ changementsDeDirectionJusquau: v })} />
            )}
            <p className="aide">Les exercices concernés sont débloqués automatiquement à ces dates (date « Dès » de la banque).</p>
          </>
        )}
        {etape === 3 && (
          <>
            <fieldset className="choix">
              <legend>Nombre moyen de séances par semaine</legend>
              <div className="segments">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={r.seancesParSemaine === n} onClick={() => set({ seancesParSemaine: n })}>
                    {n}
                  </button>
                ))}
              </div>
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
            <fieldset className="choix">
              <legend>Lieux</legend>
              {(Object.keys(LIBELLES_LIEUX) as Lieu[]).map((l) => (
                <label key={l} className="case">
                  <input type="checkbox" checked={r.lieux.includes(l)} onChange={(e) => set({ lieux: e.target.checked ? [...r.lieux, l] : r.lieux.filter((x) => x !== l) })} />
                  {LIBELLES_LIEUX[l]}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {etape === 4 && (
          <>
            <fieldset className="choix">
              <legend>Dernière course faite sans douleur</legend>
              {COURSES.map((c, i) => (
                <label key={c} className="case">
                  <input type="radio" name="course" checked={r.etapeCourse === i + 1} onChange={() => set({ etapeCourse: i + 1 })} />
                  {c}
                </label>
              ))}
              <p className="aide">La course facile commence à l'étape correspondante ({r.etapeCourse} sur 7).</p>
            </fieldset>
            <Texte label="Ta dernière course, en mots (facultatif)" valeur={r.derniereCourse ?? ''} onChange={(v) => set({ derniereCourse: v })} />
            <Texte label="Allures connues (facultatif)" valeur={r.allures ?? ''} onChange={(v) => set({ allures: v })} />
            <Texte label="Charges connues (facultatif)" valeur={r.charges ?? ''} onChange={(v) => set({ charges: v })} />
            <p className="aide">Les charges de travail sont calculées à partir des tests de la journée 1, au début du programme.</p>
          </>
        )}
        {etape === 5 && (
          <>
            <p>Les statuts des exercices (validé, à essayer, exclu) sont repris tels quels. Tu peux les revoir à tout moment dans l'écran Exercices.</p>
            <a href="#/exercices">Revoir les exercices</a>
          </>
        )}
        {etape === 6 &&
          (erreurs.length ? (
            <ul className="messages">
              {erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            apercu && (
              <>
                <p>
                  <strong>{apercu.semaines.length} semaines</strong>, du {dateCourte(r.debut)} au {dateCourte(r.echeance)} ({r.echeanceNom}).
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
                <h2>Tests prévus</h2>
                <ul className="liste-reglages">
                  {config!.retests.map((t, i) => (
                    <li key={i}>
                      S{t.semaine}
                      {t.jusquaSemaine ? ` à S${t.jusquaSemaine}` : ''} : {NOMS_TESTS[t.type]}
                      {t.moment === 'condition' ? ' (dès que tu cours 20 min sans douleur)' : ''}
                      {t.final ? ' (retest final)' : ''}
                    </li>
                  ))}
                </ul>
                <h2>Semaines légères</h2>
                <p className="aide">
                  {apercu.semaines
                    .filter((s) => s.legere)
                    .map((s) => `S${s.numero}`)
                    .join(', ') || 'Aucune'}
                  . L'app en ajoute si besoin (fatigue, douleurs, ou à ta demande).
                </p>
                <div className="actions">
                  <button type="button" className="principal" onClick={creer}>
                    Créer ce programme
                  </button>
                </div>
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

function DateChamp({ label, valeur, onChange }: { label: string; valeur: DateISO; onChange: (v: DateISO) => void }) {
  return (
    <label className="champ champ-texte">
      <span className="champ-label">{label}</span>
      <input type="date" value={valeur} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ListePeriodes({ titre, liste, onChange, exemple }: { titre: string; liste: Periode[]; onChange: (l: Periode[]) => void; exemple: string }) {
  const [p, setP] = useState<Periode>({ nom: '', debut: '', fin: '' });
  return (
    <>
      <h2>{titre}</h2>
      <ul className="liste-reglages">
        {liste.map((x, i) => (
          <li key={i}>
            {x.nom} : {dateCourte(x.debut)}
            {x.fin !== x.debut ? ` au ${dateCourte(x.fin)}` : ''}{' '}
            <button type="button" className="lien" onClick={() => onChange(liste.filter((_, j) => j !== i))}>
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <div className="formulaire">
        <label className="champ">
          <span className="champ-label">Nom</span>
          <input type="text" value={p.nom} placeholder={exemple} onChange={(e) => setP({ ...p, nom: e.target.value })} />
        </label>
        <label className="champ">
          <span className="champ-label">Premier jour</span>
          <input type="date" value={p.debut} onChange={(e) => setP({ ...p, debut: e.target.value })} />
        </label>
        <label className="champ">
          <span className="champ-label">Dernier jour</span>
          <input type="date" value={p.fin} min={p.debut} onChange={(e) => setP({ ...p, fin: e.target.value })} />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={!p.nom.trim() || !p.debut || !p.fin || p.fin < p.debut}
          onClick={() => {
            onChange([...liste, { ...p, nom: p.nom.trim() }]);
            setP({ nom: '', debut: '', fin: '' });
          }}
        >
          Ajouter
        </button>
      </div>
    </>
  );
}

function AjoutMatch({ onAjouter }: { onAjouter: (m: { nom: string; jour: JourSemaine; debut: DateISO }) => void }) {
  const [nom, setNom] = useState('');
  const [jour, setJour] = useState<JourSemaine>(3);
  const [debut, setDebut] = useState('');
  return (
    <>
      <div className="formulaire">
        <label className="champ">
          <span className="champ-label">Nom</span>
          <input type="text" value={nom} placeholder="4 contre 4" onChange={(e) => setNom(e.target.value)} />
        </label>
        <label className="champ">
          <span className="champ-label">Jour</span>
          <select value={jour} onChange={(e) => setJour(Number(e.target.value) as JourSemaine)}>
            {JOURS.map((j, i) => (
              <option key={j} value={i + 1}>
                {j}
              </option>
            ))}
          </select>
        </label>
        <label className="champ">
          <span className="champ-label">À partir du</span>
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={!nom.trim() || !debut}
          onClick={() => {
            onAjouter({ nom: nom.trim(), jour, debut });
            setNom('');
            setDebut('');
          }}
        >
          Ajouter
        </button>
      </div>
    </>
  );
}
