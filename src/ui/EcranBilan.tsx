import { useMemo } from 'react';
import { dateCourte } from '../moteur/dates';
import { bilan } from '../stockage/suivi';
import { useDonnees } from './donnees';

const NOMBRE = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 2 });

/** Bilan de préparation (section 6) : chaque test, du premier au dernier. */
export function EcranBilan() {
  const { donnees } = useDonnees();
  const lignes = useMemo(() => bilan(donnees), [donnees]);
  const faites = lignes.filter((l) => l.mesures.length > 0);

  return (
    <main className="page">
      <a className="retour" href="#/progres">
        ‹ Progrès
      </a>
      <p className="surtitre">Retests</p>
      <h1>Bilan de préparation</h1>
      <p className="aide">
        Tes tests de la journée 1, le mini-retest et le test de Cooper, du premier au dernier. Le retest final est prévu en S14. Les charges sont en kg.
      </p>
      {faites.length === 0 && <p className="aide">Pas encore de test. Les tests de la journée 1 ont lieu en S1.</p>}
      <ul className="bilan">
        {faites.map((l) => {
          const mieux = l.evolution && (l.plusPetitEstMieux ? l.evolution.valeur < 0 : l.evolution.valeur > 0);
          return (
            <li key={l.test} className="carte">
              <h2>{l.nom}</h2>
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Résultat</th>
                    {l.mesures.some((m) => m.gauche !== undefined) && <th scope="col">Gauche / droite</th>}
                  </tr>
                </thead>
                <tbody>
                  {l.mesures.map((m) => (
                    <tr key={m.date}>
                      <th scope="row">{dateCourte(m.date)}</th>
                      <td>
                        {NOMBRE(m.valeur)} {l.unite}
                      </td>
                      {l.mesures.some((x) => x.gauche !== undefined) && (
                        <td>{m.gauche !== undefined && m.droite !== undefined ? `${NOMBRE(m.gauche)} / ${NOMBRE(m.droite)}` : '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {l.evolution && (
                <p className={mieux ? 'ok' : 'aide'}>
                  {l.evolution.valeur > 0 ? '+' : ''}
                  {NOMBRE(l.evolution.valeur)} {l.unite} ({l.evolution.pourcentage > 0 ? '+' : ''}
                  {NOMBRE(l.evolution.pourcentage)} %) depuis le premier test{mieux ? ' : en progrès' : ''}.
                </p>
              )}
              {l.ecartCotes !== undefined && (
                <p className="aide">
                  Écart entre les côtés : {l.ecartCotes} %{l.ecartCotes > 10 ? ' (plus de 10 % : 1 série de plus du côté le plus faible)' : ''}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
