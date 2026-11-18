// Commentaires et ressentis de Lily sur les exercices, en texte à donner à Claude pour adapter le programme.

import { texteDosage } from '../moteur/contenu';
import { terminees } from '../moteur/progression';
import type { Donnees } from './types';

const RESSENTIS = { 'trop-dur': 'trop dur', 'trop-facile': 'trop facile', aime: "j'aime", 'aime-pas': "je n'aime pas" } as const;
const RAISONS = { temps: 'pas le temps', materiel: 'matériel pris', douleur: 'douleur', autre: 'autre' } as const;

export function texteCommentaires(programme: string, donnees: Donnees): string {
  const lignes: string[] = [`Commentaires de Lily sur son programme « ${programme} »`, ''];
  for (const r of terminees(donnees, '9999-12-31')) {
    const notes: string[] = [];
    for (const b of r.seance.contenu.blocs) {
      for (const p of b.exercices) {
        const x = r.exercices[`${b.type}:${p.id}`];
        if (!x?.avis?.ressenti && !x?.avis?.commentaire && !x?.pasFait) continue;
        const series = x.series?.map((s) => `${s.reps ?? s.secondes ?? '?'}${s.charge ? ` à ${s.charge} ${x.unite ?? 'kg'}` : ''}`).join(', ');
        const parts = [
          `prévu ${texteDosage(p)}`,
          series ? `fait : ${series}` : '',
          x.pasFait ? `pas fait (${RAISONS[x.pasFait.raison]})` : '',
          x.avis?.ressenti ? `ressenti : ${RESSENTIS[x.avis.ressenti]}` : '',
          x.avis?.commentaire ? `« ${x.avis.commentaire.trim()} »` : '',
        ].filter(Boolean);
        notes.push(`- ${p.id} ${p.nom} : ${parts.join(' ; ')}`);
      }
    }
    if (!notes.length) continue;
    const douleurs = Object.entries(r.douleurs ?? {})
      .map(([z, v]) => `${z} ${v}/10`)
      .join(', ');
    lignes.push(`## ${r.date}, semaine ${r.semaine} : ${r.seance.libelle} (effort ${r.effort ?? '?'}/10${douleurs ? `, douleurs : ${douleurs}` : ''})`, ...notes, '');
  }
  return lignes.join('\n').trim();
}
