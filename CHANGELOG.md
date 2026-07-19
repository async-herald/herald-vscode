# Changelog

Toutes les modifications notables de l'extension Async Herald.

---

## [0.0.13] - 2026

### Amélioré
- Nouvel écran de chargement : **héraut céleste doré** animé sur fond doré pendant l'analyse
- Résultats regroupés par **familles** (Structure, Sécurité, Patterns IA, Performance, Qualité, Documentation) au lieu des noms d'anges

---

## [0.0.12] - 2026

### Ajouté
- Onglet **Usage** : plan actif, quota quotidien restant, limite de débit et compteur de fichiers analysés
- Export du rapport en **PDF** et **Markdown** (comptes Pro)
- Détection de la limite quotidienne avec invitation à passer Pro

### Amélioré
- Historique des analyses récupéré après chaque analyse
- Migration des URLs vers le domaine `herald.codes` (API, web, rapports)

---

## [0.0.11] - 2026

### Ajouté
- Nouvelle interface **webview** en 3 onglets (Analyse, Usage, Config) remplaçant l'ancienne arborescence
- Résultats regroupés par les **6 familles Herald** (Auriel, Barachiel, Cassiel, Raziel, Uriel, Zadkiel)
- Problèmes **cliquables** ouvrant directement le fichier à la bonne ligne
- Éditeur intégré de `herald.config.json` (fichiers ignorés, règles désactivées, `maxFileLines`)

### Amélioré
- Flow d'authentification servi par l'app web herald.codes
- État de chargement et progression pendant l'analyse

---

## [0.0.10] - 2025

### Ajouté
- Logs d'erreur détaillés pour les erreurs serveur (502, 503, etc.)
- Fichier `.herald-error.log` créé automatiquement en cas de problème serveur

### Amélioré
- Meilleure gestion des erreurs avec messages plus clairs
- Affichage du chemin du fichier de log en cas d'erreur serveur
- README et CHANGELOG simplifiés et plus accessibles

---

## [0.0.8]

### Ajouté
- Configuration des exclusions via `herald.config.json`
- Patterns d'exclusion personnalisables par projet

---

## [0.0.7]

### Amélioré
- Statistiques de collecte plus détaillées dans la console
- Comptage des fichiers ignorés et de l'espace économisé

---

## [0.0.6]

### Ajouté
- Gestion des erreurs 413 (payload trop volumineux)
- Affichage du fichier le plus gros en cas de dépassement

---

## [0.0.5]

### Ajouté
- Support de nombreux nouveaux langages (Kotlin, Swift, Dart, etc.)
- Limites de sécurité : 500 fichiers max, 2 MB par fichier, 40 MB total

---

## [0.0.4]

### Amélioré
- Interface du panneau avec design modernisé
- Affichage des scores par dimension

---

## [0.0.3]

### Ajouté
- Authentification OAuth avec redirection automatique
- Option de token manuel pour utilisateurs avancés

---

## [0.0.2]

### Ajouté
- Panneau latéral avec résultats d'analyse
- Lien vers le rapport complet sur le web

---

## [0.0.1]

### Première version
- Analyse de code basique
- Connexion au service Herald
- Affichage du score global
