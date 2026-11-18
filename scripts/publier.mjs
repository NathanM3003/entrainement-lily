// Publie l'app sur GitHub Pages : construit dist/, puis l'envoie sur la branche gh-pages.
// Seule l'app construite est publiée (ni docs/ ni le code source). Usage : npm run publier
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const lancer = (commande, options = {}) => execSync(commande, { stdio: 'inherit', ...options });
const depot = execSync('git remote get-url origin').toString().trim();
const version = execSync('git rev-parse --short HEAD').toString().trim();

lancer('npm test');
lancer('npm run build');
writeFileSync('dist/.nojekyll', ''); // GitHub Pages sert les fichiers tels quels
rmSync('dist/.git', { recursive: true, force: true });
const dans = { cwd: 'dist' };
lancer('git init -q -b gh-pages', dans);
lancer('git add -A', dans);
lancer(`git commit -q -m "Publication de ${version}"`, dans);
lancer(`git push -q -f ${depot} gh-pages`, dans);
rmSync('dist/.git', { recursive: true, force: true });
console.log(`\nApp publiée (version ${version}). Elle sera en ligne d'ici une minute.`);
