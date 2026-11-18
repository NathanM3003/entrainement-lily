import { useRef, useState } from 'react';
import { lireSauvegarde } from '../stockage/sauvegarde';
import { useDonnees } from './donnees';

/** Première ouverture : créer son programme, ou reprendre une sauvegarde. */
export function EcranBienvenue() {
  const { importer } = useDonnees();
  const fichier = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  return (
    <main className="page bienvenue">
      <p className="surtitre">Préparation physique · ultimate</p>
      <h1>Bienvenue, Lily</h1>
      <p>Cette app prépare tes séances semaine après semaine pour arriver plus rapide et en forme au début de la saison.</p>
      <ol className="etapes-bienvenue">
        <li>Crée ton programme : ta date d'échéance, ton calendrier (frisbee, tournois, jours indisponibles, semaines plus mollo) et tes blessures.</li>
        <li>Chaque semaine, choisis ton nombre de séances et tes jours : l'app place les séances et prépare leur contenu.</li>
        <li>Note tes résultats : tout est déjà rempli avec ce qui était prévu, et l'app fait progresser tes charges et tes allures.</li>
      </ol>
      <div className="actions">
        <a className="bouton principal-lien" href="#/nouveau">
          Créer mon programme
        </a>
        <button type="button" onClick={() => fichier.current?.click()}>
          J'ai une sauvegarde
        </button>
        <input
          ref={fichier}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importer(lireSauvegarde(await f.text()));
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        />
      </div>
      {message && <p className="bandeau">{message}</p>}
      <p className="aide">Le questionnaire est déjà rempli pour la saison 2026-2027 : vérifie, ajuste ton calendrier, et c'est parti.</p>
    </main>
  );
}
