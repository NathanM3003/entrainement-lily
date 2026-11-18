import type { Phase } from './types';

export interface SegmentPhase {
  phase: Phase;
  semaines: number;
}

export interface DecoupagePhases {
  segments: SegmentPhase[];
  avertissement?: string;
}

/**
 * Durée des phases à partir du nombre de semaines N (Règles, section 1, « Calcul des durées »).
 */
export function decouperPhases(n: number): DecoupagePhases {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Nombre de semaines invalide : ${n}`);

  if (n < 4) {
    return {
      segments: [
        ...(n > 1 ? [{ phase: 'maintien' as const, semaines: n - 1 }] : []),
        { phase: 'affutage', semaines: 1 },
      ],
      avertissement:
        "Moins de 4 semaines avant l'échéance : pas de vraies phases. Le plan garde la forme actuelle, puis prévoit 1 semaine d'affûtage.",
    };
  }

  const affutage = n < 10 ? 1 : 2;
  // 30 % de N, arrondi (calcul entier pour éviter 0,3 × 15 = 4,4999…).
  const fondation = Math.min(6, Math.max(2, Math.round((3 * n) / 10)));
  const reste = n - affutage - fondation;

  const milieu: SegmentPhase[] =
    reste < 4
      ? [{ phase: 'developpement', semaines: reste }]
      : [
          { phase: 'force-vitesse', semaines: Math.ceil(reste / 2) },
          { phase: 'puissance-repetition', semaines: Math.floor(reste / 2) },
        ];

  const segments: SegmentPhase[] = [
    { phase: 'fondation', semaines: fondation },
    ...milieu,
    { phase: 'affutage', semaines: affutage },
  ];
  return { segments: segments.filter((s) => s.semaines > 0) };
}

/**
 * Une phase de plus de 6 semaines est coupée en deux blocs séparés par une semaine plus légère.
 * Renvoie le rang (à partir de 1) de cette semaine légère dans la phase, ou null.
 */
export function rangSemaineCoupure(semainesDansPhase: number): number | null {
  return semainesDansPhase > 6 ? Math.ceil(semainesDansPhase / 2) : null;
}
