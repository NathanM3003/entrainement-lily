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
  // Profil, « Blessures et zones fragiles », « Disponibilités » et « Course ».
  // La date « à 100 % » fixe les restrictions : chevilles → changements de direction, tibias → sprint à 80 %.
  sante: {
    chevilles: { etat: 'reeducation', note: 'Entorse de grade 2 à gauche, en fin de rééducation ; même entorse à droite l’an dernier.', centPourCentLe: '2027-01-01' },
    genoux: { etat: 'sensible', note: 'Tendinite à l’arrière du genou gauche, sensible quand le volume de course augmente.' },
    ischios: { etat: 'ok' },
    tibias: { etat: 'sensible', note: 'Périostite presque disparue.', centPourCentLe: '2026-12-01' },
  },
  disponibilites: { seancesParSemaine: 3, dureeMax: 90, lieux: ['gym', 'piste', 'tapis'] },
  niveau: {
    etapeCourse: 1,
    derniereCourse: '4 × (3 min de course + 1 min de marche), sans douleur',
    allures: '6:00/km facile, 5:45/km sur 5 à 10 km, 5:30/km rapide, 5:00/km très rapide',
    charges: 'Inconnues : elles se mesurent aux tests de la journée 1.',
    alluresConnues: { facile: 360, rapide: 330, tresRapide: 300 },
  },
};
