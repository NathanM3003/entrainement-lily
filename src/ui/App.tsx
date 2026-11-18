import { useEffect, useState } from 'react';
import { semaineDuJour } from '../stockage/saison';
import { useDonnees } from './donnees';
import { EcranExercices } from './EcranExercices';
import { EcranSauvegarde } from './EcranSauvegarde';
import { EcranSeance } from './EcranSeance';
import { EcranSemaine } from './EcranSemaine';

/** Navigation par l'adresse (#/semaine/3, #/seance/2026-11-23…) : le bouton retour du téléphone fonctionne. */
function useAdresse(): string {
  const [adresse, setAdresse] = useState(location.hash);
  useEffect(() => {
    const maj = () => {
      setAdresse(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', maj);
    return () => window.removeEventListener('hashchange', maj);
  }, []);
  return adresse;
}

export function App() {
  const { cal, aujourdhui, erreur } = useDonnees();
  const adresse = useAdresse();
  const [, ecran, param] = adresse.split('/');

  let contenu;
  let onglet: 'semaine' | 'exercices' | 'sauvegarde' = 'semaine';
  if (ecran === 'seance' && param) contenu = <EcranSeance key={param} date={param} />;
  else if (ecran === 'exercices') {
    contenu = <EcranExercices />;
    onglet = 'exercices';
  } else if (ecran === 'sauvegarde' || ecran === 'reglages') {
    contenu = <EcranSauvegarde />;
    onglet = 'sauvegarde';
  } else {
    const n = Number(param);
    const numero = ecran === 'semaine' && n >= 1 && n <= cal.semaines.length ? n : semaineDuJour(cal, aujourdhui);
    contenu = <EcranSemaine key={numero} numero={numero} />;
  }

  return (
    <>
      {erreur && <p className="bandeau erreur">{erreur}</p>}
      {contenu}
      <nav className="barre" aria-label="Navigation">
        <a href="#/" aria-current={onglet === 'semaine' ? 'page' : undefined}>
          Semaine
        </a>
        <a href="#/exercices" aria-current={onglet === 'exercices' ? 'page' : undefined}>
          Exercices
        </a>
        <a href="#/reglages" aria-current={onglet === 'sauvegarde' ? 'page' : undefined}>
          Réglages
        </a>
      </nav>
    </>
  );
}
