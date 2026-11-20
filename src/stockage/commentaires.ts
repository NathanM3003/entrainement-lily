// Commentaires et ressentis de Lily sur les exercices, en texte à donner à Claude pour adapter le programme.

import { texteDosage } from '../moteur/contenu';
import { terminees } from '../moteur/progression';
import type { Donnees } from './types';

const RESSENTIS = { 'trop-dur': 'trop dur', 'trop-facile': 'trop facile', aime: "j'aime", 'aime-pas': "je n'aime pas" } as const;
const RAISONS = { temps: 'pas le temps', materiel: 'matériel pris', douleur: 'douleur', autre: 'autre' } as const;

const ZONES = { chevilles: 'Chevilles', genoux: 'Genoux', ischios: 'Ischios', tibias: 'Tibias', autre: 'Autre' } as const;
const ETATS = { ok: 'ça va', sensible: 'sensible', reeducation: 'en rééducation' } as const;

export function texteCommentaires(programme: string, donnees: Donnees): string {
  const prenom = donnees.preferences.prenom?.trim();
  const lignes: string[] = [`Commentaires ${prenom ? `de ${prenom} ` : ''}sur son programme « ${programme} »`, ''];
  // Santé déclarée à la création, avec ses précisions (l'app ne s'en sert que pour les dates).
  const sante = Object.entries(donnees.programme?.sante ?? {}).filter(([, v]) => v && (v.etat !== 'ok' || v.note));
  if (sante.length) {
    lignes.push('## Santé');
    for (const [z, v] of sante) {
      lignes.push(`- ${ZONES[z as keyof typeof ZONES]} : ${ETATS[v!.etat]}${v!.centPourCentLe ? `, à 100 % le ${v!.centPourCentLe}` : ''}${v!.note ? ` (« ${v!.note} »)` : ''}`);
    }
    lignes.push('');
  }
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
    lignes.push(`## ${r.date}, semaine ${r.semaine} : ${r.seance.libelle} (effort ${r.effort ?? '?'}/10${r.duree ? `, ${r.duree} min au lieu d'environ ${r.seance.contenu.minutes}` : ''}${douleurs ? `, douleurs : ${douleurs}` : ''})`, ...notes, '');
  }
  return lignes.join('\n').trim();
}
