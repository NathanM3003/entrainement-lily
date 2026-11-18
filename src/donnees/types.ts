export type TypeExercice = 'force' | 'vitesse' | 'agilite' | 'pliometrie' | 'endurance' | 'prevention';

export type Statut = 'valide' | 'a-essayer' | 'exclu';

/** Date « Dès » de la banque. La date réelle dépend du programme (restrictions datées). */
export type Des = 'maintenant' | 'decembre' | 'janvier';

interface ExerciceCommun {
  id: string;
  type: TypeExercice;
  nom: string;
  description: string;
  dosage: string;
  materiel: string;
  plusFacile: string;
  plusDifficile: string;
  pourLeFrisbee?: string;
  video?: string;
}

export interface ExerciceRetenu extends ExerciceCommun {
  statut: 'valide' | 'a-essayer';
  categorie: string;
  des: Des;
  /** Pour un exercice « à essayer » : ce qui le remplace s'il est refusé. */
  remplacements?: string[];
  /** Exercice de réserve, jamais programmé automatiquement (F5). */
  reserve?: boolean;
  noteStatut?: string;
}

export interface ExerciceExclu extends ExerciceCommun {
  statut: 'exclu';
}

export type Exercice = ExerciceRetenu | ExerciceExclu;
