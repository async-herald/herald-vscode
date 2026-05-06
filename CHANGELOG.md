# Changelog

Toutes les modifications notables de l'extension Async Herald.

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
