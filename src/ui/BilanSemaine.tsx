import { useMemo } from 'react';
import type { SemaineCalculee } from '../stockage/saison';
import { bilanSemaine, calculerSuivi } from '../stockage/suivi';
import { useDonnees } from './donnees';

/** Bilan d'une semaine : séances faites, records, badges, douleurs, et un mot pour la suite. */
export function BilanSemaine({ calc, titre = 'Bilan de la semaine' }: { calc: SemaineCalculee; titre?: string }) {
  const { saison, donnees, aujourdhui, cal } = useDonnees();
  const suivi = useMemo(() => calculerSuivi(saison, donnees, aujourdhui), [saison, donnees, aujourdhui]);
  const b = bilanSemaine(calc, suivi, donnees);
  const suivante = Math.min(cal.semaines.length, b.numero + 1);
  return (
    <section className="carte bilan-semaine">
      <h2>{titre}</h2>
      <p className="bilan-message">{b.message}</p>
      <ul className="bilan-liste">
        <li>
          <strong>
            {b.faites} / {b.prevues}
          </strong>{' '}
          séance{b.prevues > 1 ? 's' : ''} faite{b.faites > 1 ? 's' : ''}
          {b.minutes ? `, environ ${Math.round(b.minutes)} min` : ''}
        </li>
        {b.effortMoyen !== undefined && <li>Effort moyen : {b.effortMoyen.toLocaleString('fr-CA')} sur 10</li>}
        {b.records.length > 0 && <li>★ Record{b.records.length > 1 ? 's' : ''} : {b.records.join(', ')}</li>}
        {b.badges.length > 0 && <li>★ Badge{b.badges.length > 1 ? 's' : ''} : {b.badges.join(', ')}</li>}
        {b.douleurs.length > 0 && (
          <li>
            Douleurs à surveiller : {b.douleurs.map((d) => `${d.zone} ${d.note}/10`).join(', ')}. Si ça dure, parle-en à ta physio.
          </li>
        )}
      </ul>
      {b.numero < cal.semaines.length && (
        <a className="bouton" href={`#/semaine/${suivante}`}>
          Prévoir la semaine {suivante}
        </a>
      )}
    </section>
  );
}
