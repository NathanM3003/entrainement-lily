import { useEffect, useState } from 'react';
import { chargerIllustrations, exercicesRetenus, LIBELLES_TYPES } from '../donnees/banque';
import type { TypeExercice } from '../donnees/types';

const TYPES = Object.keys(LIBELLES_TYPES) as TypeExercice[];

// Écran provisoire (étape 0) : la banque d'exercices avec ses illustrations,
// pour vérifier l'extraction. Il sera remplacé par la semaine et la séance du jour.
export function App() {
  const [illustrations, setIllustrations] = useState<Record<string, string>>({});
  const [type, setType] = useState<TypeExercice>('force');

  useEffect(() => {
    chargerIllustrations().then(setIllustrations);
  }, []);

  const liste = exercicesRetenus.filter((e) => e.type === type);

  return (
    <main className="page">
      <header className="entete">
        <p className="surtitre">Saison 2026-2027</p>
        <h1>Entraînement de Lily</h1>
      </header>

      <nav className="onglets" aria-label="Types d'exercices">
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={t === type} onClick={() => setType(t)}>
            {LIBELLES_TYPES[t]}
          </button>
        ))}
      </nav>

      <ul className="fiches">
        {liste.map((e) => (
          <li key={e.id} className="fiche">
            <div
              className="illu"
              role="img"
              aria-label={`Illustration : ${e.nom}`}
              dangerouslySetInnerHTML={{ __html: illustrations[e.id] ?? '' }}
            />
            <div className="fiche-corps">
              <p className="fiche-meta">
                <span className="numero">{e.id}</span>
                {e.statut === 'a-essayer' && <span className="etiquette">À essayer</span>}
              </p>
              <h2>{e.nom}</h2>
              <p>{e.description}</p>
              <dl>
                <dt>Dosage</dt>
                <dd>{e.dosage}</dd>
                <dt>Matériel</dt>
                <dd>{e.materiel}</dd>
              </dl>
              {e.video && (
                <a href={e.video} target="_blank" rel="noopener noreferrer">
                  Voir une démonstration vidéo
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
