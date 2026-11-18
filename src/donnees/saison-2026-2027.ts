import type { ProgrammeConfig } from '../moteur/types';

/**
 * Programme de la saison 2026-2027, rempli à partir de « Profil Lily » et « Règles du programme ».
 * La ligue 5 contre 5 du jeudi n'est pas incluse : elle n'est pas encore confirmée.
 */
export const SAISON_2026_2027: ProgrammeConfig = {
  nom: 'Saison 2026-2027',
  debut: '2026-11-23',
  echeance: '2027-03-13',
  echeanceNom: 'Début de la saison',
  restrictions: {
    sprint: { intensiteMax: 80, jusquau: '2026-11-30' },
    changementsDeDirection: { jusquau: '2026-12-31' },
  },
  periodesAllegees: [
    { debut: '2026-12-21', fin: '2026-12-27', nom: 'Noël' },
    { debut: '2027-01-01', fin: '2027-01-10', nom: 'Vacances', note: 'Accès à un gym avec tapis' },
  ],
  tournois: [
    { debut: '2027-01-23', fin: '2027-01-24', nom: 'Tournoi de janvier' },
    { debut: '2027-02-13', fin: '2027-02-14', nom: 'Tournoi de février' },
    { debut: '2027-03-06', fin: '2027-03-07', nom: 'Tournoi de mars' },
  ],
  matchsReguliers: [{ nom: '4 contre 4 intérieur', jour: 3, debut: '2027-01-13' }],
  // Règles, section 6, tableau « Retests ».
  retests: [
    { type: 'journee1', moment: 'semaine', semaine: 1, sansSprint: true },
    { type: 'sprint', moment: 'premiere-seance-a', semaine: 2 },
    { type: 'cooper', moment: 'condition', semaine: 4, jusquaSemaine: 6 },
    { type: 'mini', moment: 'semaine', semaine: 5 },
    { type: 'journee1', moment: 'fin', semaine: 10, avecSautUneJambe: true },
    { type: 'cooper', moment: 'debut', semaine: 11 },
    { type: 'journee1', moment: 'fin', semaine: 14, avecSautUneJambe: true, final: true },
  ],
  // Règles, section 6 : S5, S7, S10, début de S13, S15 et S16. Le moteur déduit S5 et S7 (périodes allégées),
  // le début de S13 (après un tournoi) et S15-S16 (affûtage). S10 est fixée ici.
  semainesLegeres: [{ semaine: 10, raison: 'Après le tournoi, semaine de retest' }],
};
