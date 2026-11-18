import { useRef, useState } from 'react';
import { dateCourte } from '../moteur/dates';
import { CRANS_PAR_DEFAUT, cranConverti, LIBELLES_MATERIEL, type Materiel } from '../moteur/progression';
import { texteCommentaires } from '../stockage/commentaires';
import { ChampNombre } from './communs';
import { creerSauvegarde, lireSauvegarde } from '../stockage/sauvegarde';
import type { Unite, UniteAllure } from '../stockage/types';
import { useDonnees } from './donnees';

/** Export et import du fichier de sauvegarde, réglage des unités. */
export function EcranSauvegarde() {
  const { donnees, aujourdhui, modifierPreferences, importer, lireSauvegarde: toutLire } = useDonnees();
  const [message, setMessage] = useState<string>();
  const fichier = useRef<HTMLInputElement>(null);
  const nbSeances = Object.values(donnees.resultats).filter((r) => r.terminee).length;
  const derniere = donnees.preferences.derniereSauvegarde;

  async function exporter() {
    const { nom, contenu } = creerSauvegarde(await toutLire(), aujourdhui);
    const f = new File([contenu], nom, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [f] })) {
        // Sur le téléphone : enregistrer dans Fichiers, l'envoyer par courriel…
        await navigator.share({ files: [f], title: 'Sauvegarde de l’entraînement' });
      } else {
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url;
        a.download = nom;
        a.click();
        URL.revokeObjectURL(url);
      }
      modifierPreferences({ derniereSauvegarde: aujourdhui });
      setMessage(`Sauvegarde créée : ${nom}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage("La sauvegarde n'a pas pu être créée.");
    }
  }

  async function importerFichier(f: File) {
    try {
      const nouvelles = lireSauvegarde(await f.text());
      const n = nouvelles.programmes.reduce((t, p) => t + Object.values(p.donnees.resultats).filter((r) => r.terminee).length, 0);
      const np = nouvelles.programmes.length;
      if (!confirm(`Remplacer toutes les données de l'app par cette sauvegarde (${np} programme${np > 1 ? 's' : ''}, ${n} séance${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''}) ?`)) return;
      await importer(nouvelles);
      setMessage('Sauvegarde importée.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <main className="page">
      <p className="surtitre">Réglages</p>
      <h1>Programmes et sauvegarde</h1>

      <MesProgrammes />

      <h2 className="titre-section">Sauvegarde</h2>
      <section className="carte">
        <p>
          Tes données restent sur ce téléphone, sans compte ni serveur. Une fois par semaine, crée une sauvegarde et garde-la
          ailleurs (Fichiers, courriel, nuage) : si le téléphone est perdu ou changé, tu pourras tout récupérer. Elle contient tous tes programmes.
        </p>
        <p className="aide">
          {nbSeances} séance{nbSeances > 1 ? 's' : ''} faite{nbSeances > 1 ? 's' : ''} dans ce programme.{' '}
          {derniere ? `Dernière sauvegarde : ${dateCourte(derniere)}.` : 'Aucune sauvegarde pour le moment.'}
        </p>
        <div className="actions">
          <button type="button" className="principal" onClick={exporter}>
            Créer une sauvegarde
          </button>
          <button type="button" onClick={() => fichier.current?.click()}>
            Importer une sauvegarde
          </button>
          <input
            ref={fichier}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importerFichier(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className="ok" role="status">{message}</p>}
      </section>

      <CommentairesPourClaude />

      <section className="carte">
        <h2>Poids disponibles au gym</h2>
        <p className="aide">
          L'écart entre deux poids, pour monter d'un cran. Entre-le dans l'unité de ton gym : l'autre unité est calculée toute seule. L'app arrondit
          toujours au poids disponible en dessous.
        </p>
        {(Object.keys(CRANS_PAR_DEFAUT) as Materiel[]).map((m) => {
          const reglage = donnees.preferences.crans?.[m];
          const u: Unite = reglage?.lb !== undefined && reglage.kg === undefined ? 'lb' : 'kg';
          const valeur = reglage?.[u] ?? CRANS_PAR_DEFAUT[m][u];
          const autre: Unite = u === 'kg' ? 'lb' : 'kg';
          const crans = donnees.preferences.crans ?? {};
          return (
            <div key={m} className="ligne-crans">
              <span>{LIBELLES_MATERIEL[m]}</span>
              <ChampNombre
                label="Écart"
                unite={u}
                decimal
                valeur={valeur}
                onChange={(v) => {
                  if (!v || v <= 0) return;
                  modifierPreferences({ crans: { ...crans, [m]: { [u]: v } } });
                }}
              />
              <div className="segments petit-segments" role="group" aria-label={`Unité, ${LIBELLES_MATERIEL[m]}`}>
                {(['kg', 'lb'] as Unite[]).map((x) => (
                  <button key={x} type="button" aria-pressed={u === x} onClick={() => x !== u && modifierPreferences({ crans: { ...crans, [m]: { [x]: CRANS_PAR_DEFAUT[m][x] } } })}>
                    {x}
                  </button>
                ))}
              </div>
              <span className="petit cran-autre">
                {reglage
                  ? `≈ ${cranConverti(valeur, u).toLocaleString('fr-CA')} ${autre}, calculé tout seul`
                  : `Par défaut : ${CRANS_PAR_DEFAUT[m].kg.toLocaleString('fr-CA')} kg ou ${CRANS_PAR_DEFAUT[m].lb} lb`}
              </span>
            </div>
          );
        })}
      </section>

      <section className="carte">
        <h2>Unités</h2>
        <p className="aide">Pour les charges, le choix kg ou lb se fait sur chaque exercice.</p>
        <fieldset className="choix">
          <legend>Allure de course</legend>
          <div className="segments">
            {(['min/km', 'km/h', 'mi/h'] as UniteAllure[]).map((u) => (
              <button key={u} type="button" aria-pressed={donnees.preferences.allure === u} onClick={() => modifierPreferences({ allure: u })}>
                {u}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
    </main>
  );
}

/** Les programmes enregistrés : suivre, modifier le calendrier, créer, supprimer. */
function MesProgrammes() {
  const { programmes, actif, cal, activerProgramme, supprimerProgramme } = useDonnees();
  const [aSupprimer, setASupprimer] = useState<string>();
  return (
    <section className="carte">
      <h2>Mes programmes</h2>
      <ul className="liste-programmes">
        {programmes.map((p) => (
          <li key={p.id} className={p.id === actif ? 'actif' : ''}>
            <strong>
              {p.nom}
              {p.id === actif ? ' · suivi' : ''}
            </strong>
            {p.id === actif && (
              <span className="petit">
                Du {dateCourte(cal.config.debut)} au {dateCourte(cal.config.echeance)}, {cal.semaines.length} semaines.
              </span>
            )}
            <div className="actions">
              {p.id === actif ? (
                <a className="bouton" href="#/modifier">
                  Modifier le calendrier et les blessures
                </a>
              ) : (
                <button type="button" onClick={() => activerProgramme(p.id)}>
                  Suivre ce programme
                </button>
              )}
              {aSupprimer === p.id ? (
                <>
                  <button type="button" className="danger" onClick={() => supprimerProgramme(p.id).then(() => setASupprimer(undefined))}>
                    Oui, supprimer avec ses résultats
                  </button>
                  <button type="button" onClick={() => setASupprimer(undefined)}>
                    Annuler
                  </button>
                </>
              ) : (
                <button type="button" className="discret" onClick={() => setASupprimer(p.id)}>
                  Supprimer
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <a className="bouton principal-lien" href="#/nouveau">
          Nouveau programme
        </a>
      </div>
      <p className="aide">Tu peux garder plusieurs programmes (une saison, un été…) : chacun garde ses résultats. Tu en suis un à la fois.</p>
    </section>
  );
}

/** Tes commentaires et ressentis sur les exercices, à copier pour les donner à Claude et adapter le programme. */
function CommentairesPourClaude() {
  const { donnees, cal } = useDonnees();
  const [etat, setEtat] = useState<string>();
  const texte = texteCommentaires(cal.config.nom, donnees);
  const nb = (texte.split('## Santé')[1] ? texte.replace(/## Santé[\s\S]*?\n\n/, '') : texte).match(/^- /gm)?.length ?? 0;
  return (
    <section className="carte">
      <h2>Tes commentaires sur les exercices</h2>
      <p className="aide">
        {nb ? `${nb} commentaire${nb > 1 ? 's' : ''} ou ressenti${nb > 1 ? 's' : ''} noté${nb > 1 ? 's' : ''}.` : 'Aucun commentaire pour le moment.'} Copie-les pour les
        donner à Claude : il pourra adapter le programme.
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={!texte.includes('- ')}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texte);
              setEtat('Copié.');
            } catch {
              setEtat('La copie a échoué : sélectionne le texte ci-dessous.');
            }
          }}
        >
          Copier mes commentaires
        </button>
      </div>
      {etat && <p className="ok" role="status">{etat}</p>}
      {nb > 0 && (
        <details>
          <summary>Voir le texte</summary>
          <pre className="commentaires">{texte}</pre>
        </details>
      )}
    </section>
  );
}
