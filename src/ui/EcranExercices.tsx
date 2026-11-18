import { useState } from 'react';
import { exercicesRetenus, LIBELLES_TYPES } from '../donnees/banque';
import type { TypeExercice } from '../donnees/types';
import { Illustration, useIllustrations } from './communs';

const TYPES = Object.keys(LIBELLES_TYPES) as TypeExercice[];

/** La banque d'exercices illustrée, pour revoir un exercice à tout moment. */
export function EcranExercices() {
  const illustrations = useIllustrations();
  const [type, setType] = useState<TypeExercice>('force');
  const liste = exercicesRetenus.filter((e) => e.type === type && !e.reserve);

  return (
    <main className="page">
      <p className="surtitre">Banque d'exercices</p>
      <h1>Exercices</h1>
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
            <Illustration id={e.id} nom={e.nom} illustrations={illustrations} />
            <div className="fiche-corps">
              <p className="fiche-meta">
                <span className="numero">{e.id}</span>
                {e.statut === 'a-essayer' && <span className="etiquette">À essayer</span>}
              </p>
              <h3>{e.nom}</h3>
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
