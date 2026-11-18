import { useEffect, useState } from 'react';
import { chargerIllustrations } from '../donnees/banque';
import { dateCourte, JOURS, jourSemaine, type DateISO } from '../moteur/dates';

// ---------- Illustrations (chargées une seule fois, à part) ----------

let cache: Promise<Record<string, string>> | null = null;

export function useIllustrations(): Record<string, string> {
  const [illustrations, setIllustrations] = useState<Record<string, string>>({});
  useEffect(() => {
    cache ??= chargerIllustrations();
    let actif = true;
    cache.then((i) => actif && setIllustrations(i));
    return () => {
      actif = false;
    };
  }, []);
  return illustrations;
}

export function Illustration({ id, nom, illustrations }: { id: string; nom: string; illustrations: Record<string, string> }) {
  // Le dessin porte lui-même son nom (role="img" et aria-label dans le SVG).
  return <div className="illu" title={nom} dangerouslySetInnerHTML={{ __html: illustrations[id] ?? '' }} />;
}

// ---------- Dates ----------

const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** « lundi 23 nov. » */
export const jourEtDate = (d: DateISO) => `${JOURS[jourSemaine(d) - 1]} ${dateCourte(d)}`;
/** « lun. 23 » */
export const jourCourt = (d: DateISO) => `${JOURS_COURTS[jourSemaine(d) - 1]} ${Number(d.slice(8))}`;
export const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Champs ----------

/** Champ numérique qui accepte la virgule (clavier français) et laisse vide quand rien n'est entré. */
export function ChampNombre({
  valeur,
  onChange,
  label,
  unite,
  decimal = false,
}: {
  valeur: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  unite?: string;
  decimal?: boolean;
}) {
  const versTexte = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));
  const [texte, setTexte] = useState(versTexte(valeur));
  useEffect(() => {
    const actuel = Number(texte.replace(',', '.'));
    if (valeur !== (texte === '' ? undefined : actuel)) setTexte(versTexte(valeur));
  }, [valeur]);
  return (
    <label className="champ">
      <span className="champ-label">{label}</span>
      <span className="champ-saisie">
        <input
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={texte}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d,.]/g, '');
            setTexte(t);
            const n = Number(t.replace(',', '.'));
            onChange(t === '' || Number.isNaN(n) ? undefined : n);
          }}
        />
        {unite && <span className="champ-unite">{unite}</span>}
      </span>
    </label>
  );
}

/** Échelle de 0 à 10 (effort, douleur). */
export function Echelle({ valeur, onChange, label, aide }: { valeur: number | undefined; onChange: (v: number) => void; label: string; aide?: string }) {
  return (
    <fieldset className="echelle">
      <legend>
        {label}
        {aide && <span className="aide"> {aide}</span>}
      </legend>
      <div className="echelle-boutons">
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} type="button" aria-pressed={valeur === i} onClick={() => onChange(i)}>
            {i}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
