import { useEffect, useRef } from 'react';

export interface SerieGraphique {
  nom: string;
  valeurs: (number | null)[];
}

const NOMBRE = (n: number) => n.toLocaleString('fr-CA', { maximumFractionDigits: 1 });

/**
 * Graphique simple (Chart.js, chargé à part pour alléger le premier affichage).
 * Couleurs par rôle (variables CSS --serie-1 à --serie-4, clair et sombre), une seule échelle,
 * légende dès 2 séries, infobulle au survol et tableau des chiffres pour l'accessibilité.
 */
export function Graphique({
  titre,
  type = 'line',
  etiquettes,
  series,
  unite,
  min,
  max,
}: {
  titre: string;
  type?: 'line' | 'bar';
  etiquettes: string[];
  series: SerieGraphique[];
  unite: string;
  min?: number;
  max?: number;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const vide = series.every((s) => s.valeurs.every((v) => v === null));

  useEffect(() => {
    if (vide || !toile.current) return;
    let graphique: { destroy: () => void } | undefined;
    let actif = true;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (!actif || !toile.current) return;
      const css = getComputedStyle(toile.current);
      const v = (nom: string) => css.getPropertyValue(nom).trim();
      const couleurs = [1, 2, 3, 4].map((i) => v(`--serie-${i}`));
      graphique = new Chart(toile.current, {
        type,
        data: {
          labels: etiquettes,
          datasets: series.map((s, i) => ({
            label: s.nom,
            data: s.valeurs,
            borderColor: couleurs[i],
            backgroundColor: couleurs[i],
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderColor: v('--surface'),
            pointBorderWidth: 2,
            spanGaps: true,
            tension: 0,
            borderRadius: 4,
            maxBarThickness: 28,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: series.length > 1, position: 'top', align: 'start', labels: { color: v('--encre'), boxWidth: 12, boxHeight: 12, usePointStyle: true } },
            tooltip: {
              callbacks: { label: (c) => `${c.dataset.label} : ${c.parsed.y === null ? '—' : NOMBRE(c.parsed.y)} ${unite}` },
            },
          },
          scales: {
            x: { ticks: { color: v('--discret'), maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { color: v('--ligne') } },
            y: { min, max, ticks: { color: v('--discret') }, grid: { color: v('--ligne') }, border: { display: false } },
          },
        },
      });
    });
    return () => {
      actif = false;
      graphique?.destroy();
    };
  }, [vide, type, etiquettes, series, unite, min, max]);

  return (
    <figure className="graphique">
      <figcaption>
        {titre} <span className="petit">({unite})</span>
      </figcaption>
      {vide ? (
        <p className="aide">Pas encore de données.</p>
      ) : (
        <>
          <div className="graphique-zone">
            <canvas ref={toile} role="img" aria-label={`${titre}, en ${unite}`} />
          </div>
          <details>
            <summary>Voir les chiffres</summary>
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  {series.map((s) => (
                    <th key={s.nom} scope="col">
                      {s.nom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etiquettes.map((e, i) =>
                  series.every((s) => s.valeurs[i] === null) ? null : (
                    <tr key={e + i}>
                      <th scope="row">{e}</th>
                      {series.map((s) => (
                        <td key={s.nom}>{s.valeurs[i] === null ? '—' : NOMBRE(s.valeurs[i]!)}</td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}
