# Interface utilisateur - Panneau Herald

Ce document décrit l'interface du panneau Herald dans la sidebar VSCode.

## 🎨 Design moderne

L'interface utilise :
- **Emojis** pour une identification rapide
- **Couleurs thématiques** pour guider l'utilisateur
- **Sections collapsibles** pour une meilleure organisation
- **Badges descriptifs** (👈) pour indiquer les actions recommandées

## États du panneau

### État 1 : Non connecté

```
▼ ⚡ Async Herald
  └── ℹ️  Bienvenue sur Async Herald !
      └── Analysez et améliorez votre code

▼ 🔐 Connexion
  ├── 🔗 Lier mon compte Async
  │   └── ⭐ Recommandé • Rapide et sécurisé
  └── 🔑 Définir un token manuel
      └── Pour utilisateurs avancés

▼ ✨ Fonctionnalités
  ├── 📊 Score de qualité
  │   └── Note globale de 0 à 100
  ├── 🐛 Détection intelligente
  │   └── Bugs et anti-patterns
  ├── 📈 Rapports détaillés
  │   └── Dashboard web interactif
  ├── ⚡ Analyse rapide
  │   └── Résultats en quelques secondes
  └── 🎯 Conseils personnalisés
      └── Recommandations adaptées

▶ 📚 Ressources
  ├── 📖 Documentation
  ├── 💬 Support
  ├── 🐛 Signaler un bug
  └── ⭐ GitHub
```

**Actions disponibles** :
- Cliquer sur "🔗 Lier mon compte Async" → Lance le flow OAuth (recommandé)
- Cliquer sur "🔑 Définir un token manuel" → Saisie manuelle du token

### État 2 : Connecté (sans analyse)

```
▼ 👤 Profil
  ├── user@example.com
  │   └── Connecté
  └── 🚪 Se déconnecter

▼ 🎯 Actions
  └── ▶️ Analyser le projet
      └── Lancer une nouvelle analyse

▶ 📚 Ressources
  └── ...
```

**Actions disponibles** :
- Cliquer sur "🚪 Se déconnecter" → Déconnexion
- Cliquer sur "▶️ Analyser le projet" → Lance l'analyse

### État 3 : Connecté (avec résultats)

```
▼ 👤 Profil
  ├── user@example.com
  │   └── Connecté
  └── 🚪 Se déconnecter

▼ 🎯 Actions
  └── ▶️ Analyser le projet
      └── Lancer une nouvelle analyse

▼ 📊 Dernière analyse (il y a 5 min)
  ├── ▼ ℹ️  Résumé
  │   ├── 🌟 Score global
  │   │   └── 85/100 • Grade B+
  │   └── ✅ Problèmes détectés
  │       └── 12 problème(s)
  └── 📄 Voir le rapport complet
      └── Ouvrir dans le navigateur

▶ 📚 Ressources
  └── ...
```

**Actions disponibles** :
- Cliquer sur "▶️ Analyser le projet" → Lance une nouvelle analyse
- Cliquer sur "📄 Voir le rapport complet" → Ouvre le navigateur

## Codes couleur et emojis

### Scores

| Score | Emoji | Couleur | Icône |
|-------|-------|---------|-------|
| >= 90 | 🏆 | Vert | `pass` |
| >= 80 | 🌟 | Vert | `pass` |
| >= 70 | 👍 | Orange | `warning` |
| >= 60 | ⚠️ | Orange | `warning` |
| < 60 | 🔴 | Rouge | `error` |

### Statuts

| État | Couleur | Icône |
|------|---------|-------|
| Connecté | Vert (`charts.green`) | `verified-filled` |
| Non connecté | Bleu (`charts.blue`) | `circuit-board` |
| Problèmes détectés | Orange (`charts.orange`) | `warning` |
| Aucun problème | Vert (`charts.green`) | `pass` |

### Actions

| Action | Couleur | Icône |
|--------|---------|-------|
| Lier compte (OAuth) | Vert (`charts.green`) | `link` |
| Token manuel | Orange (`charts.orange`) | `key` |
| Analyser | Bleu (`charts.blue`) | `play-circle` |
| Se déconnecter | Rouge (`charts.red`) | `sign-out` |
| Ouvrir rapport | Bleu (`charts.blue`) | `link-external` |

## Flow utilisateur complet

### 1. Premier lancement

```
1. User ouvre VSCode
   ↓
2. Extension s'active automatiquement
   ↓
3. Panneau affiche la vue non connectée
   ↓
4. User voit les deux options de connexion
   ↓
5a. Option 1 : OAuth (recommandé)
    - User clique "🔗 Lier mon compte Async"
    - Navigateur s'ouvre → Page d'autorisation
    - User se connecte et autorise
    - Redirection vers VSCode avec token

5b. Option 2 : Token manuel
    - User clique "🔑 Définir un token manuel"
    - Saisie du token dans une InputBox
    - Validation du format (doit commencer par "herald_")
    - Token stocké de manière sécurisée
   ↓
6. Panneau affiche "Connecté" + email
7. Notification : "Token Herald enregistré avec succès !"
```

### 2. Analyse de code

```
1. User clique "▶️ Analyser le projet"
   ↓
2. Notification : "Analyse Herald en cours..."
   ↓
3. Extension collecte les fichiers (.js, .ts, .py, etc.)
   ↓
4. Envoi à l'API Herald
   ↓
5. Réception des résultats
   ↓
6. Panneau affiche la section "📊 Dernière analyse"
   ↓
7. Notification : "Analyse terminée ! Score: XX/100 (Grade) - X problème(s)"
```

### 3. Consultation du rapport

```
1. User clique "📄 Voir le rapport complet"
   ↓
2. Navigateur s'ouvre
   ↓
3. Page du rapport détaillé sur app.itsasync.fr
```

## Icônes et thèmes

| Élément | Icône VSCode | Couleur | Usage |
|---------|--------------|---------|-------|
| Profil | `account` | `charts.blue` | Section profil utilisateur |
| Connecté | `verified-filled` | `charts.green` | Statut connecté |
| Actions | `target` | `charts.purple` | Section actions |
| Analyser | `play-circle` | `charts.blue` | Bouton d'analyse |
| Dernière analyse | `graph-line` | `charts.purple` | Section résultats |
| Score | `pass`/`warning`/`error` | Variable | Score selon valeur |
| Problèmes | `warning`/`pass` | `charts.orange`/`charts.green` | Nombre de problèmes |
| Horodatage | `history` | `charts.gray` | Temps écoulé |
| Rapport | `link-external` | `charts.blue` | Ouvrir le rapport |
| OAuth | `link` | `charts.green` | Connexion OAuth |
| Token manuel | `key` | `charts.orange` | Token manuel |
| Déconnexion | `sign-out` | `charts.red` | Se déconnecter |
| Ressources | `book` | `charts.gray` | Section ressources |

## Interactions

### Clics

Tous les boutons sont cliquables :
- **🔗 Lier mon compte Async** → `async-herald.connect`
- **🔑 Définir un token manuel** → `async-herald.setToken`
- **🚪 Se déconnecter** → `async-herald.disconnect`
- **▶️ Analyser le projet** → `async-herald.analyze`
- **📄 Voir le rapport complet** → `async-herald.openReport`

### Survol

Les descriptions s'affichent au survol :
- Email de l'utilisateur connecté
- Grade à côté du score
- Temps écoulé depuis la dernière analyse
- Descriptions des fonctionnalités

### Expansion/Collapse

Sections collapsibles :
- **👤 Profil** : Expanded par défaut
- **🎯 Actions** : Expanded par défaut
- **📊 Dernière analyse** : Expanded par défaut
- **✨ Fonctionnalités** : Expanded par défaut (vue non connectée)
- **📚 Ressources** : Collapsed par défaut

## Messages de notification

| Message | Type | Déclencheur |
|---------|------|-------------|
| "Authentification Herald réussie !" | Info | Connexion OAuth réussie |
| "Token Herald enregistré avec succès !" | Info | Token manuel défini |
| "Déconnecté de Herald" | Info | Déconnexion |
| "Analyse Herald en cours..." | Progress | Pendant l'analyse |
| "Analyse terminée ! Score: XX/100 (Grade) - X problème(s)" | Info | Fin d'analyse |
| "Vous devez vous connecter pour utiliser Herald" | Warning | Analyse sans auth |
| "Le token ne peut pas être vide" | Error | Token vide |
| "Le token doit commencer par 'herald_'" | Error | Format token invalide |
| "Aucun fichier à analyser" | Warning | Workspace vide |
| "Erreur d'analyse: ..." | Error | Erreur API |
| "Aucun rapport disponible" | Warning | Clic sur rapport sans analyse |

## Commandes palette (Cmd/Ctrl + Shift + P)

Toutes les commandes sont accessibles via la palette :

```
> Async Herald : Lier mon compte
> Async Herald : Définir le token manuellement
> Async Herald : Se déconnecter
> Async Herald : Analyser le projet
> Async Herald : Voir le rapport complet
> Async Herald : Ouvrir le menu
```

## Persistance des données

### Stockées de manière sécurisée (context.secrets)
- Token Herald (via OAuth ou manuel)

### Stockées dans globalState
- ID du dernier rapport (`lastReportId`)

### Non persistées (état du provider)
- Email utilisateur
- Dernière analyse (score, grade, nombre de problèmes, timestamp)

Ces données sont rechargées au redémarrage de VSCode en vérifiant le token et en appelant l'API si nécessaire.

## Validation du token manuel

Lors de la saisie d'un token manuel :

1. **Format requis** : Le token doit commencer par `herald_`
2. **Validation** : Vérification en temps réel dans l'InputBox
3. **Stockage sécurisé** : Utilisation de `context.secrets.store()`
4. **Vérification** : Appel à l'API pour récupérer les infos utilisateur

Si le token est invalide, l'utilisateur est averti et peut réessayer.
