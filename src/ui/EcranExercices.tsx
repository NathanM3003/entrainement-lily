import { useState } from 'react';
import { exercices, LIBELLES_TYPES } from '../donnees/banque';
import type { Statut, TypeExercice } from '../donnees/types';
import { Illustration, useIllustrations } from './communs';
import { useDonnees } from './donnees';

const TYPES = Object.keys(LIBELLES_TYPES) as TypeExercice[];
const STATUTS: Record<Statut, string> = { valide: 'Validé', 'a-essayer': 'À essayer', exclu: 'Exclu' };

/** La banque d'exercices illustrée. Lily peut changer le statut de n'importe quel exercice (section 6). */
export function EcranExercices() {
  const illustrations = useIllustrations();
  const { donnees, changerStatut } = useDonnees();
  const [type, setType] = useState<TypeExercice>('force');
  const [exclus, setExclus] = useState(false);
  const statutDe = (id: string, base: Statut) => donnees.statuts?.[id] ?? base;
  const liste = exercices.filter((e) => e.type === type && (exclus || statutDe(e.id, e.statut) !== 'exclu'));

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
      <label className="case">
        <input type="checkbox" checked={exclus} onChange={(e) => setExclus(e.target.checked)} />
        Afficher aussi les exercices exclus
      </label>
      <ul className="fiches">
        {liste.map((e) => {
          const statut = statutDe(e.id, e.statut);
          const change = donnees.statuts?.[e.id] !== undefined && donnees.statuts[e.id] !== e.statut;
          return (
            <li key={e.id} className={statut === 'exclu' ? 'fiche pas-fait' : 'fiche'}>
              <Illustration id={e.id} nom={e.nom} illustrations={illustrations} />
              <div className="fiche-corps">
                <p className="fiche-meta">
                  <span className="numero">{e.id}</span>
                  {statut === 'a-essayer' && <span className="etiquette">À essayer</span>}
                  {'reserve' in e && e.reserve && <span className="etiquette">Réserve : jamais programmé automatiquement</span>}
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
                <fieldset className="choix statut">
                  <legend>Statut{change ? ' (changé par toi)' : ''}</legend>
                  <div className="segments petit-segments">
                    {(Object.keys(STATUTS) as Statut[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={statut === s}
                        onClick={() => changerStatut(e.id, s === e.statut ? null : s)}
                      >
                        {STATUTS[s]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
