import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { FournisseurDonnees } from './ui/donnees';
import './ui/styles.css';
import './donnees/illustrations.generated.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <FournisseurDonnees>
      <App />
    </FournisseurDonnees>
  </StrictMode>,
);
