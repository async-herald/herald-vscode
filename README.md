# Async Herald

**Améliorez la qualité de votre code en un clic.**

Async Herald analyse votre projet et vous donne un score de qualité avec des recommandations concrètes, directement dans VSCode.

---

## Pourquoi utiliser Async Herald ?

- **Simple** : Un clic pour analyser tout votre projet
- **Rapide** : Résultats en quelques secondes
- **Actionnable** : Chaque problème est cliquable et vous amène droit à la ligne concernée
- **Complet** : Architecture, performance, sécurité, documentation, patterns IA et qualité

---

## Comment ça marche ?

### 1. Connectez-vous

Ouvrez le panneau **Async Herald** dans la barre latérale secondaire et cliquez sur **« Lier mon compte »**. Le navigateur s'ouvre sur [herald.codes](https://herald.codes) pour autoriser l'extension, puis vous êtes redirigé automatiquement vers VSCode.

> Vous pouvez aussi coller un token manuel (commençant par `herald_`) via la commande **« Définir le token manuellement »**.

### 2. Lancez l'analyse

Cliquez sur **« Analyser le projet »**. Herald collecte automatiquement vos fichiers de code et les envoie à l'API.

### 3. Consultez vos résultats

Le panneau affiche :
- Un **score global** sur 100 et une **note** (A à F)
- Les **problèmes détectés**, regroupés par famille Herald et par sévérité
- Un lien vers le **rapport complet** sur le web (et l'export **PDF / Markdown** pour les comptes Pro)

---

## Les 6 familles Herald

Chaque famille est un « héraut » spécialisé dans une dimension de la qualité :

| Famille | Dimension | Ce qu'elle inspecte |
|---------|-----------|---------------------|
| **Auriel** | Architecture | Structure et organisation du code |
| **Barachiel** | Performance | Memory leaks et goulots d'étranglement |
| **Cassiel** | Patterns IA | Code généré par IA non optimisé |
| **Raziel** | Documentation | Documentation et couverture de tests |
| **Uriel** | Sécurité | Failles et vulnérabilités |
| **Zadkiel** | Qualité | Qualité globale du code |

---

## Le panneau en 3 onglets

- **Analyse** — score, note et liste des problèmes cliquables
- **Usage** — votre plan, votre quota quotidien restant et le nombre de fichiers analysés
- **Config** — personnalisez l'analyse via `herald.config.json` (fichiers ignorés, règles désactivées, seuils)

---

## Langages supportés

JavaScript, TypeScript, Python, Rust, Go, Java, Kotlin, C/C++, PHP, Ruby, Swift, Dart, et bien d'autres.

---

## Gratuit vs Pro

- **Gratuit** : analyses quotidiennes limitées, rapport web
- **Pro** : analyses illimitées et export du rapport en PDF / Markdown

Passez Pro depuis l'onglet **Usage** ou sur [herald.codes/plans](https://herald.codes/plans).

---

## Besoin d'aide ?

- Documentation : [herald.codes](https://herald.codes)
- Dépôt : [github.com/itsasync/async-herald](https://github.com/itsasync/async-herald)

---

**Async Herald** — Faites passer votre code au niveau supérieur.
