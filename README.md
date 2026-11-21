# Async Herald

**Améliorez la qualité de votre code en un clic.**

Async Herald analyse votre projet et vous donne un score de qualité avec des recommandations concrètes, directement dans VSCode.

---

## Pourquoi utiliser Async Herald ?

- **Simple** : Un clic pour analyser tout votre projet
- **Rapide** : Résultats en quelques secondes
- **Actionnable** : Chaque problème est cliquable et vous amène droit à la ligne concernée
- **Local** : l'analyse tourne sur votre machine avec Async Herald Desktop, aucun fichier n'est envoyé
- **Complet** : sécurité, qualité, versioning, DevOps, patterns, dépendances et tests

---

## Comment ça marche ?

L'analyse se fait **sur votre machine** : aucun fichier n'est envoyé.

### 1. Installez Async Herald Desktop

L'extension s'appuie sur l'app **Async Herald Desktop**, qui contient le moteur d'analyse.
Téléchargez-la sur [herald.codes/downloads](https://herald.codes/downloads)
(sur macOS : `brew install async-herald/tap/herald`). Tant qu'elle n'est pas installée,
le panneau propose de la télécharger.

L'extension trouve l'app à son emplacement habituel. Sinon, indiquez son chemin avec
**« Indiquer l'emplacement d'Async Herald Desktop »** (réglage `asyncHerald.desktopPath`).

### 2. Lancez l'analyse

Cliquez sur **« Analyser le projet »** : l'extension lance Async Herald Desktop en
arrière-plan sur le dossier ouvert, sans ouvrir sa fenêtre, et affiche la progression.
L'analyse utilise les mêmes règles que l'app et compte dans le quota du compte connecté
dans l'app.

### 3. Consultez vos résultats

Le panneau affiche :
- Le **score global** sur 100 et la **note** (A+ à F), avec l'écart depuis l'analyse précédente
- Les **problèmes**, regroupés par **catégorie** (Sécurité, Qualité, Versioning, DevOps,
  Pattern, Dépendances, Tests) puis par règle ; chaque emplacement ouvre le fichier à la bonne ligne
- **« Voir dans Async Herald »** ouvre l'app sur le projet (plan de correction, historique,
  export PDF et Markdown)

---

## Le panneau en 2 onglets

- **Analyse** — score, note et problèmes cliquables, par catégorie
- **Config** — personnalisez l'analyse via `herald.config.json` (fichiers ignorés, règles désactivées, seuils)

---

## Langages supportés

JavaScript, TypeScript, Python, Rust, Go, Java, Kotlin, C/C++, PHP, Ruby, Swift, Dart, et bien d'autres.

---

## Compte et quota

Le compte, le quota d'analyses et l'historique sont ceux d'Async Herald Desktop :
connectez-vous dans l'app. Détails du fonctionnement : [DESKTOP-CLI.md](DESKTOP-CLI.md).

---

## Besoin d'aide ?

- Documentation : [herald.codes](https://herald.codes)
- Dépôt : [github.com/async-herald/herald-vscode](https://github.com/async-herald/herald-vscode)

---

**Async Herald** — Faites passer votre code au niveau supérieur.
