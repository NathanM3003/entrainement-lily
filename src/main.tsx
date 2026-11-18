import { StrictMode } from 'react';
import { registerSW } from 'virtual:pwa-register';
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

// Mise à jour de l'app installée : dès qu'une nouvelle version est publiée, elle s'installe et la page se recharge
// (sinon le téléphone garde l'ancienne version tant que l'app n'est pas complètement fermée).
// On vérifie aussi toutes les heures et au retour dans l'app.
const mettreAJour = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => void registration.update(), 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void registration.update());
  },
});
void mettreAJour;
