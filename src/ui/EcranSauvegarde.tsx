import { useRef, useState } from 'react';
import { dateCourte } from '../moteur/dates';
import { CRANS_PAR_DEFAUT, LIBELLES_MATERIEL, type Materiel } from '../moteur/progression';
import { ChampNombre } from './communs';
import { creerSauvegarde, lireSauvegarde } from '../stockage/sauvegarde';
import type { Unite, UniteAllure } from '../stockage/types';
import { useDonnees } from './donnees';

/** Export et import du fichier de sauvegarde, réglage des unités. */
export function EcranSauvegarde() {
  const { donnees, aujourdhui, modifierPreferences, importer } = useDonnees();
  const [message, setMessage] = useState<string>();
  const fichier = useRef<HTMLInputElement>(null);
  const nbSeances = Object.values(donnees.resultats).filter((r) => r.terminee).length;
  const derniere = donnees.preferences.derniereSauvegarde;

  async function exporter() {
    const { nom, contenu } = creerSauvegarde(donnees, aujourdhui);
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
      const n = Object.values(nouvelles.resultats).filter((r) => r.terminee).length;
      if (!confirm(`Remplacer toutes les données de l'app par cette sauvegarde (${n} séance${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''}) ?`)) return;
      await importer(nouvelles);
      setMessage('Sauvegarde importée.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <main className="page">
      <p className="surtitre">Tes données</p>
      <h1>Sauvegarde</h1>
      <section className="carte">
        <p>
          Tes données restent sur ce téléphone, sans compte ni serveur. Une fois par semaine, crée une sauvegarde et garde-la
          ailleurs (Fichiers, courriel, nuage) : si le téléphone est perdu ou changé, tu pourras tout récupérer.
        </p>
        <p className="aide">
          {nbSeances} séance{nbSeances > 1 ? 's' : ''} faite{nbSeances > 1 ? 's' : ''} enregistrée{nbSeances > 1 ? 's' : ''}.{' '}
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

      <section className="carte">
        <h2>Poids disponibles au gym</h2>
        <p className="aide">
          L'écart entre deux poids, pour monter d'un cran. Par exemple, si les haltères vont de 2 en 2 kg, mets 2. L'app arrondit toujours au poids
          disponible en dessous.
        </p>
        {(Object.keys(CRANS_PAR_DEFAUT) as Materiel[]).map((m) => (
          <div key={m} className="ligne-crans">
            <span>{LIBELLES_MATERIEL[m]}</span>
            {(['kg', 'lb'] as Unite[]).map((u) => (
              <ChampNombre
                key={u}
                label={`En ${u}`}
                unite={u}
                decimal
                valeur={donnees.preferences.crans?.[m]?.[u] ?? CRANS_PAR_DEFAUT[m][u]}
                onChange={(v) => {
                  if (!v || v <= 0) return;
                  const crans = donnees.preferences.crans ?? {};
                  modifierPreferences({ crans: { ...crans, [m]: { ...crans[m], [u]: v } } });
                }}
              />
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
