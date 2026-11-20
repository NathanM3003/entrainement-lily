import { useEffect, useState } from 'react';
import { semaineDuJour } from '../stockage/saison';
import { useDonnees } from './donnees';
import { EcranAccueil } from './EcranAccueil';
import { EcranBienvenue } from './EcranBienvenue';
import { EcranBilan } from './EcranBilan';
import { EcranExercices } from './EcranExercices';
import { EcranNouveauProgramme } from './EcranNouveauProgramme';
import { EcranProgres } from './EcranProgres';
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
  const { cal, aujourdhui, erreur, programmes, donnees } = useDonnees();
  // Titre de l'onglet avec le prénom saisi sur le téléphone.
  const prenom = donnees.preferences.prenom?.trim();
  useEffect(() => {
    document.title = prenom ? `Entraînement de ${prenom}` : 'Mon entraînement';
  }, [prenom]);
  const adresse = useAdresse();
  const [, ecran, param] = adresse.split('/');

  let contenu;
  let onglet: 'accueil' | 'semaine' | 'progres' | 'exercices' | 'sauvegarde' = 'accueil';
  if (programmes.length === 0 && ecran !== 'nouveau') {
    // Première ouverture : pas encore de programme.
    return (
      <>
        {erreur && <p className="bandeau erreur">{erreur}</p>}
        <EcranBienvenue />
      </>
    );
  }
  if (ecran === 'seance' && param) {
    contenu = <EcranSeance key={param} date={param} />;
    onglet = 'semaine';
  }
  else if (ecran === 'progres' || ecran === 'bilan') {
    contenu = ecran === 'bilan' ? <EcranBilan /> : <EcranProgres />;
    onglet = 'progres';
  }
  else if (ecran === 'exercices') {
    contenu = <EcranExercices />;
    onglet = 'exercices';
  } else if (ecran === 'nouveau' || ecran === 'modifier') {
    contenu = <EcranNouveauProgramme key={ecran} mode={ecran} />;
    onglet = 'sauvegarde';
  } else if (ecran === 'sauvegarde' || ecran === 'reglages') {
    contenu = <EcranSauvegarde />;
    onglet = 'sauvegarde';
  } else if (ecran === 'semaine') {
    const n = Number(param);
    const numero = n >= 1 && n <= cal.semaines.length ? n : semaineDuJour(cal, aujourdhui);
    contenu = <EcranSemaine key={numero} numero={numero} />;
    onglet = 'semaine';
  } else {
    contenu = <EcranAccueil />;
  }

  return (
    <>
      {erreur && <p className="bandeau erreur">{erreur}</p>}
      {contenu}
      <nav className="barre" aria-label="Navigation">
        <a href="#/" aria-current={onglet === 'accueil' ? 'page' : undefined}>
          Accueil
        </a>
        <a href="#/semaine" aria-current={onglet === 'semaine' ? 'page' : undefined}>
          Semaine
        </a>
        <a href="#/progres" aria-current={onglet === 'progres' ? 'page' : undefined}>
          Progrès
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
