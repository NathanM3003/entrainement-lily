# App d'entraînement de Lily : préparation de la saison d'ultimate frisbee

## Contexte

On crée une application d'entraînement physique pour Lily, une amie qui prépare sa prochaine saison d'ultimate frisbee. Elle est handleuse, parfois hybride. Elle a 3 saisons complètes à haut niveau.

**Son objectif :** devenir plus rapide et plus légère sans perdre son explosivité ni sa puissance, et être le plus en forme possible. La vitesse est sa priorité.

**Le périmètre :** uniquement de la mise en forme individuelle, sans disque.

Les étapes 1 à 3 ont été faites et validées dans un projet claude.ai. **Ce dossier sert à l'étape 4 : le développement de l'application.**

## Documents de référence (dans `docs/`)

Ces documents ont été validés avec Lily. Ce sont eux qui font foi. **Lis-les avant de commencer, et avant toute décision sur la logique d'entraînement.**

| Fichier | Contenu |
|---|---|
| `docs/Profil Lily.md` | Profil, calendrier 2026-2027, disponibilités, matériel, blessures, allures, tests de référence |
| `docs/Types d'entraînement.md` | Les 6 types d'entraînement et leur rôle |
| `docs/Banque d'exercices.md` | Les 84 exercices retenus, avec leurs numéros (F1, V5, M3…), dosage, matériel, versions plus facile et plus difficile, statut et date « Dès », plus les 15 exclus |
| `docs/Règles du programme.md` | **Toute la logique de l'app :** phases, séances types, placement, matchs, progression, semaines légères, retests, exercices « à essayer » |

Une page illustrée de la banque d'exercices existe aussi (artifact claude.ai « Banque d'exercices de Lily »). Si le fichier `docs/banque-illustree.html` est présent, réutilise ses illustrations pour les exercices.

## Fonctionnalités attendues

- Création d'un programme. L'app pose les questions de création : dates, événements, santé, disponibilités, niveau, exercices. Pour la saison 2026-2027, tout est prérempli à partir du profil.
- Génération automatique du plan : phases, séances, contenu.
- Chaque semaine, Lily choisit son nombre de séances (1 à 4) et ses jours disponibles. L'app choisit les jours, le type de chaque séance et son contenu.
- Déclaration des matchs (réguliers ou imprévus) et des tournois, avec ajustement automatique de la semaine.
- Une image ou une illustration pour chaque exercice.
- Saisie des résultats préremplie avec ce qui était prévu. Lily modifie seulement ce qui a changé. Un bouton « Pas fait » sur chaque exercice. Une note d'effort globale de la séance (0 à 10). Des notes de douleur (tibias, arrière du genou, chevilles).
- Progression automatique calculée à partir des chiffres entrés.
- Charges en kilos ou en livres, au choix pour chaque exercice. Allures en min/km, km/h ou mi/h.
- Graphiques de progression simples.
- Côté motivant : séries, badges, records personnels.
- Retests intégrés au calendrier, avec une page « bilan de préparation ».
- L'app doit pouvoir resservir pour une autre saison, avec d'autres dates, restrictions et événements. Mais **la priorité est que tout fonctionne parfaitement pour la saison 2026-2027.**
- Plus tard (étape 5, faite à part) : une page de conseils nutrition hors repas (collations santé, hydratation).

## Règles de travail

- **Réponds en français.** Les textes de l'app sont aussi en français, simples et clairs.
- **Les documents de `docs/` font foi.** N'invente pas de règles d'entraînement. Si une règle manque ou se contredit, demande avant de trancher.
- **Ne programme jamais un exercice exclu.** Respecte les statuts (validé, à essayer) et les dates « Dès ».
- **Le poids corporel de Lily n'est jamais suivi.**
- Avant les choix techniques importants (plateforme, stockage des données, structure), propose les options avec leurs avantages et inconvénients, et attends la validation.
- Si une décision prise ici modifie la logique d'entraînement, mets à jour le document concerné dans `docs/` et signale-le.

## Dates clés de la saison 2026-2027

- Début du programme : lundi 23 novembre 2026. Début de la saison : samedi 13 mars 2027.
- Sprint à 80 % jusqu'au 30 novembre, puis 100 %.
- Aucun changement de direction avant le 1er janvier 2027.
- Semaines allégées : 21 au 27 décembre, et 1er au 10 janvier.
- 4 contre 4 tous les mercredis à partir du 13 janvier 2027. Peut-être une ligue le jeudi (à confirmer).
- Tournois : 23-24 janvier, 13-14 février, 6-7 mars 2027.

## Décisions techniques (validées le 17 novembre 2026)

- **Plateforme :** application web installable qui fonctionne hors ligne (PWA), pensée pour le téléphone. TypeScript, Vite, React (ou Preact), Vitest, Chart.js pour les graphiques.
- **Stockage :** sur le téléphone seulement (IndexedDB), avec export et import d'un fichier de sauvegarde et un rappel hebdomadaire d'exporter. Pas de compte ni de serveur.
- **Modèle de données :** l'app enregistre seulement ce que Lily entre (réglages du programme, choix de chaque semaine, matchs, résultats). Le plan est recalculé à partir de ces entrées, ce qui permet de ne changer que les semaines à venir et d'ajouter une synchronisation plus tard sans tout refaire.
- **Illustrations :** les dessins vectoriels de `docs/banque-illustree.html` (99 SVG d'environ 1,3 Ko, couleurs du mode sombre comprises), extraits et rattachés à chaque numéro d'exercice, avec le lien vers une démonstration vidéo. Ils doivent rester légers et faciles à comprendre.
- **Organisation du code :** données (banque d'exercices, configuration de la saison), moteur (toute la logique d'entraînement, sans interface, entièrement testé, chaque règle renvoyant à sa section de `docs/Règles du programme.md`), interface. Les exemples des documents servent de tests : calendrier S1 à S16, tableau des durées de phases, exemples de placement avec matchs.

## Commandes

Node 26 (LTS) est installé dans `~/.local/node`, pas avec Homebrew : `brew install node` échoue sur ce Mac, faute des outils de développement d'Apple. S'il n'est pas dans le PATH, préfixer les commandes par `export PATH="$HOME/.local/node/bin:$PATH" &&`. La configuration de prévisualisation est dans `.claude/launch.json` (nom : `app`, port 5173).

- `npm install` : installe les dépendances.
- `npm run dev` : lance l'app en local.
- `npm test` : lance tous les tests (Vitest). Un seul fichier : `npx vitest run src/donnees/banque.test.ts`. Un seul test : ajouter `-t "nom du test"`.
- `npm run typecheck` : vérifie les types TypeScript.
- `npm run build` : construit l'app hors ligne dans `dist/`.
- `npm run publier` : lance les tests, construit l'app et l'envoie sur la branche `gh-pages`, publiée par GitHub Pages à l'adresse https://nathanm3003.github.io/entrainement-lily/. Seul `dist/` est publié. À relancer après chaque changement que Lily doit recevoir : l'app installée se met à jour toute seule à la réouverture suivante. (Le jeton GitHub de ce Mac n'a pas le droit de créer des workflows : pas de GitHub Actions.)
- `npm run banque` : régénère la banque et les illustrations à partir de `docs/`. Il faut le relancer après toute modification de `docs/Banque d'exercices.md` ou de `docs/banque-illustree.html`.

## Structure du code

- `scripts/extraire-banque.mjs` : lit `docs/Banque d'exercices.md`, qui fait foi pour les statuts, dosages et dates « Dès », et `docs/banque-illustree.html` pour les dessins, « Pour le frisbee », les liens vidéo et les exclus. Il produit les fichiers `src/donnees/*.generated.*`. Ne modifie jamais ces fichiers à la main.
- `src/donnees/` : la banque d'exercices typée (`banque.ts`, `types.ts`). Les dessins sont chargés à part pour alléger le premier affichage. Leurs couleurs passent par les variables `--il-*` de `illustrations.generated.css`, ce qui gère aussi le mode sombre.
- `src/moteur/` : toute la logique d'entraînement, sans interface et sans état. Les dates sont des chaînes `AAAA-MM-JJ` calculées en UTC (`dates.ts`). `calendrier.ts` transforme un `ProgrammeConfig` en semaines (phases, semaines légères, jours allégés, récupération après tournoi, matchs, retests). `phases.ts` calcule les durées de phases. `restrictions.ts` applique le sprint limité, les changements de direction et les dates « Dès ». `semaine.ts` place les séances d'une semaine à partir du choix de Lily (nombre de séances, jours disponibles, matchs déclarés). Il essaie tous les placements possibles, élimine ceux qui enfreignent une règle de la section 3, garde le mieux noté (voir `noter`) et, si rien ne marche, recommence avec une séance de moins. Il reçoit les séances de la semaine précédente pour ne pas enchaîner dimanche et lundi. Si aucun jour ne permet A ni B, il garde C ou D. Une semaine changée en cours de route (`ChoixSemaine.depuis`) reçoit ses séances déjà faites, qui restent fixes ; les autres sont placées à partir de ce jour. `contenu.ts` détaille chaque séance planifiée : exercices, dosage, rotation, prévention minimale, essais, semaines légères, coupes selon les matchs, changements de direction, affûtage, tests et durée maximale. `detaillerSemaine` reçoit l'état de Lily (statuts changés, essais faits, étape de course). `texteDosage` écrit le dosage pour l'interface. `progression.ts` : progression automatique (section 5 et précisions de la section 7) : charge prévue (`chargePrevue`, maximum estimé, crans, garde-fous), état qui avance de semaine en semaine (`apresSemaine` : étape de course, sprints, niveau de pliométrie) et effets immédiats des douleurs (`suiviDouleurs`), VMA et ajustements d'allure (`allures`), progression des intermittents, séries en plus du côté le plus faible, condition du test de Cooper et semaines légères anticipées.
- `src/donnees/saison-2026-2027.ts` : les paramètres de la saison. Les retests et la semaine légère S10 y sont fixés tels que validés. Le reste est déduit par le moteur.
- `src/stockage/` : ce que Lily entre (`types.ts`) et son stockage sur le téléphone (`idb.ts`, IndexedDB, clés `choix:<semaine>`, `resultat:<date>`, `preferences`). `saison.ts` recalcule toute la saison à partir de ces entrées (le calendrier est refait avec les semaines légères anticipées ou demandées, clé `legeres`, et les matchs réguliers et tournois ajoutés par Lily, clé `saison` ; les tests manqués sont reportés ; les notes d'effort des matchs sont sous la clé `notesMatchs`) : une séance commencée garde le contenu figé à sa première saisie, et les essais faits et les décisions (« Je garde »…) alimentent le moteur. `saisie.ts` : préremplissage, unités, douleurs demandées. `sauvegarde.ts` : fichier d'export et d'import, rappel hebdomadaire.
- `src/ui/` : l'interface React. Navigation par l'adresse (`#/semaine/3`, `#/seance/2026-11-23`, `#/exercices`, `#/reglages`). `donnees.tsx` charge les données et les enregistre à chaque changement.

## Plan de développement

Ordre fixé selon la date où Lily a besoin de chaque fonction :

0. Installation (Node, git), extraction de la banque et des illustrations.
1. Moteur du calendrier : phases, semaines, restrictions datées, semaines légères, retests (doit reproduire S1 à S16).
2. Moteur de la semaine : jours, type de séance selon 1 à 4 séances, charge pour les jambes.
3. Contenu des séances (section 7 des Règles) : exercices, dosage, rotation, 1 h 30 maximum, exercices « à essayer ».
4. **Première version sur le téléphone pour le 23 novembre :** semaine, séance du jour, fiches illustrées, saisie préremplie, « Pas fait », notes d'effort et de douleur, sauvegarde.
5. Progression automatique (charges, course, douleurs, sauts, sprints, unités), pour S2.
6. Retests, test de Cooper, allures tirées de la VMA, semaine légère anticipée, vers S4-S5.
7. Matchs, tournois, ajout et retrait de séances, routine d'avant-match, avant le 13 janvier.
8. Graphiques, records, badges, séries, bilan de préparation, avant S14.
9. Questionnaire de création d'un nouveau programme.
