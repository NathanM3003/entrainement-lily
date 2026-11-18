import { useState } from 'react';
import { ajouterJours, JOURS, jourSemaine, lundiDe, type DateISO, type JourSemaine } from '../moteur/dates';
import type { Marque } from '../moteur/programme';
import type { MatchRegulier } from '../moteur/types';

type Pinceau = Marque | 'gomme';

const PINCEAUX: { id: Pinceau; libelle: string; icone: string; aide: string }[] = [
  { id: 'frisbee', libelle: 'Frisbee', icone: '🥏', aide: 'Un match ou une pratique : rien de chargé la veille et le lendemain.' },
  { id: 'tournoi', libelle: 'Tournoi', icone: '🏆', aide: 'Jours de tournoi : 2 séances courtes au plus cette semaine-là, récupération après.' },
  { id: 'indispo', libelle: 'Indisponible', icone: '✕', aide: 'Pas de séance ce jour-là (voyage, travail, examens…).' },
  { id: 'mollo', libelle: 'Plus mollo', icone: '〰', aide: 'Séances d’environ 1 h, mêmes charges (Noël, voyage…). Une semaine entière en compte 2 au plus.' },
  { id: 'gomme', libelle: 'Effacer', icone: '⌫', aide: 'Retire ce qui est marqué sur un jour.' },
];

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Calendrier du programme à colorier : Lily choisit un pinceau, puis touche les jours.
 * Le frisbee peut se répéter chaque semaine (match régulier).
 */
export function CalendrierPeint({
  debut,
  fin,
  marques,
  series,
  onMarques,
  onSeries,
  aujourdhui,
}: {
  aujourdhui: DateISO;
  debut: DateISO;
  fin: DateISO;
  marques: Record<DateISO, Marque>;
  series: MatchRegulier[];
  onMarques: (m: Record<DateISO, Marque>) => void;
  onSeries: (s: MatchRegulier[]) => void;
}) {
  const [pinceau, setPinceau] = useState<Pinceau>('frisbee');
  const [chaqueSemaine, setChaqueSemaine] = useState(false);
  const [semaineEntiere, setSemaineEntiere] = useState(false);

  const serieDe = (d: DateISO) => series.find((s) => s.jour === jourSemaine(d) && d >= s.debut && (!s.fin || d <= s.fin));

  function toucher(d: DateISO) {
    if (pinceau === 'frisbee' && chaqueSemaine) {
      if (!serieDe(d)) onSeries([...series, { nom: 'Frisbee', jour: jourSemaine(d) as JourSemaine, debut: d }]);
      return;
    }
    const jours =
      semaineEntiere && (pinceau === 'mollo' || pinceau === 'indispo' || pinceau === 'gomme')
        ? Array.from({ length: 7 }, (_, i) => ajouterJours(lundiDe(d), i)).filter((x) => x >= debut && x <= fin)
        : [d];
    const suivant = { ...marques };
    const efface = pinceau === 'gomme' || (jours.length === 1 && marques[d] === pinceau);
    for (const j of jours) {
      if (efface) delete suivant[j];
      else suivant[j] = pinceau as Marque;
    }
    onMarques(suivant);
  }

  // Mois à afficher, du mois du début à celui de la fin.
  const mois: { annee: number; mois: number }[] = [];
  for (let a = Number(debut.slice(0, 4)), m = Number(debut.slice(5, 7)) - 1; ; ) {
    mois.push({ annee: a, mois: m });
    if (a > Number(fin.slice(0, 4)) || (a === Number(fin.slice(0, 4)) && m >= Number(fin.slice(5, 7)) - 1)) break;
    m++;
    if (m === 12) {
      m = 0;
      a++;
    }
  }
  const aide = PINCEAUX.find((p) => p.id === pinceau)!.aide;

  return (
    <div className="calendrier-peint">
      <div className="pinceaux" role="radiogroup" aria-label="Que veux-tu marquer ?">
        {PINCEAUX.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={pinceau === p.id} className={`pinceau marque-${p.id}`} onClick={() => setPinceau(p.id)}>
            <span aria-hidden="true">{p.icone}</span> {p.libelle}
          </button>
        ))}
      </div>
      <p className="aide">{aide} Touche les jours pour les marquer ; touche de nouveau pour retirer.</p>
      {pinceau === 'frisbee' && (
        <label className="case">
          <input type="checkbox" checked={chaqueSemaine} onChange={(e) => setChaqueSemaine(e.target.checked)} />
          Chaque semaine, à partir du jour touché (match régulier)
        </label>
      )}
      {(pinceau === 'mollo' || pinceau === 'indispo' || pinceau === 'gomme') && (
        <label className="case">
          <input type="checkbox" checked={semaineEntiere} onChange={(e) => setSemaineEntiere(e.target.checked)} />
          Toute la semaine du jour touché
        </label>
      )}

      {mois.map(({ annee, mois: m }) => {
        const premier = `${annee}-${String(m + 1).padStart(2, '0')}-01`;
        const nbJours = new Date(Date.UTC(annee, m + 1, 0)).getUTCDate();
        const decalage = jourSemaine(premier) - 1;
        return (
          <section key={premier} className="mois">
            <h3>
              {MOIS[m]} {annee}
            </h3>
            <div className="grille" role="grid">
              {COURTS.map((c, i) => (
                <span key={i} className="entete" aria-hidden="true">
                  {c}
                </span>
              ))}
              {Array.from({ length: decalage }, (_, i) => (
                <span key={`v${i}`} />
              ))}
              {Array.from({ length: nbJours }, (_, i) => {
                const d = `${annee}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                const dedans = d >= debut && d <= fin;
                const marque = marques[d] ?? (serieDe(d) ? 'frisbee' : undefined);
                const icone = marque ? PINCEAUX.find((p) => p.id === marque)!.icone : '';
                const nom = `${JOURS[jourSemaine(d) - 1]} ${i + 1} ${MOIS[m]}${marque ? `, ${PINCEAUX.find((p) => p.id === marque)!.libelle.toLowerCase()}` : ''}${!marques[d] && serieDe(d) ? ' (chaque semaine)' : ''}`;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`jour-peint${marque ? ` marque-${marque}` : ''}${!marques[d] && serieDe(d) ? ' serie' : ''}`}
                    disabled={!dedans}
                    aria-label={nom}
                    onClick={() => toucher(d)}
                  >
                    <span>{i + 1}</span>
                    <span className="icone" aria-hidden="true">
                      {icone}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {series.length > 0 && (
        <>
          <h3>Frisbee chaque semaine</h3>
          <ul className="liste-reglages">
            {series.map((s, i) => (
              <li key={i}>
                {s.nom} : le {JOURS[s.jour - 1]}, à partir du {Number(s.debut.slice(8))} {MOIS[Number(s.debut.slice(5, 7)) - 1]}
                {s.fin ? `, jusqu'au ${Number(s.fin.slice(8))} ${MOIS[Number(s.fin.slice(5, 7)) - 1]}` : ''}{' '}
                {s.debut < aujourdhui && !s.fin ? (
                  <button type="button" className="lien" onClick={() => onSeries(series.map((x, j) => (j === i ? { ...x, fin: ajouterJours(aujourdhui, -1) } : x)))}>
                    Arrêter à partir d'aujourd'hui
                  </button>
                ) : (
                  <button type="button" className="lien" onClick={() => onSeries(series.filter((_, j) => j !== i))}>
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
