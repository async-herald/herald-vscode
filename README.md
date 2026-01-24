# Async Herald - Extension VSCode

Extension VSCode pour analyser la qualité de votre code avec [Async Herald](https://app.itsasync.fr).

## Fonctionnalités

- **🔐 Authentification flexible** : OAuth sécurisé ou token manuel pour les utilisateurs avancés
- **⚡ Analyse de code rapide** : Scannez votre projet en quelques secondes 
- **📊 Résultats détaillés** : Score, grade et problèmes détectés avec interface visuelle
- **📈 Rapports complets** : Dashboard web interactif avec analyses approfondies
- **🎨 Interface moderne** : Design intuitif avec emojis et codes couleur

## Installation

1. Clonez ce dépôt
2. Installez les dépendances : `npm install`
3. Compilez le projet : `npm run compile`
4. Appuyez sur `F5` pour lancer l'extension en mode développement

## Utilisation

### 1. Ouvrir le panneau Herald

Cliquez sur l'icône Herald dans la barre latérale ou utilisez la commande :
- **Cmd/Ctrl + Shift + P** → `Async Herald : Ouvrir le menu`

### 2. Connexion à Async Herald

Vous avez deux méthodes de connexion :

#### Option 1 : Lier mon compte Async (Recommandé)

Dans le panneau Herald, cliquez sur **"🔗 Lier mon compte Async"**.

Cela va :
1. Ouvrir votre navigateur sur la page d'autorisation
2. Vous demander de vous connecter (si nécessaire)
3. Vous rediriger automatiquement vers VSCode avec un token sécurisé

#### Option 2 : Définir un token manuel (Avancé)

Pour les utilisateurs avancés :
1. Cliquez sur **"🔑 Définir un token manuel"**
2. Entrez votre token Herald (commence par `herald_`)
3. Le token sera stocké de manière sécurisée

Vous pouvez obtenir un token manuel depuis le [dashboard web](https://app.itsasync.fr/dashboard/herald-tokens).

### 3. Analyser votre projet

Une fois connecté, cliquez sur **"Analyser le projet"**.

L'extension va :
- Collecter tous les fichiers de code de votre workspace
- Envoyer le code à l'API Herald pour analyse
- Afficher les résultats dans le panneau

### 4. Voir les résultats

Les résultats s'affichent directement dans le panneau :
- **Score** : Note globale sur 100
- **Grade** : Note lettrée (A+, A, B+, etc.)
- **Problèmes** : Nombre de problèmes détectés
- **Timestamp** : Date de la dernière analyse

Cliquez sur **"Voir le rapport complet"** pour ouvrir le rapport détaillé dans votre navigateur.

### 5. Se déconnecter

Cliquez sur **"Se déconnecter"** pour supprimer le token local.

## Langages supportés

- JavaScript (`.js`)
- TypeScript (`.ts`, `.tsx`)
- JSX (`.jsx`)
- Python (`.py`)
- Rust (`.rs`)
- Go (`.go`)
- Java (`.java`)

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `Async Herald : Lier mon compte` | Démarre le flow d'authentification OAuth (recommandé) |
| `Async Herald : Définir le token manuellement` | Permet de définir un token Herald manuellement (avancé) |
| `Async Herald : Se déconnecter` | Supprime le token et déconnecte l'utilisateur |
| `Async Herald : Analyser le projet` | Lance l'analyse du workspace actif |
| `Async Herald : Voir le rapport complet` | Ouvre le rapport dans le navigateur |
| `Async Herald : Ouvrir le menu` | Affiche le panneau Herald |

## Configuration

L'extension utilise par défaut l'API et le frontend d'Async :
- API : `https://v2-api.itsasync.fr`
- Frontend : `https://app.itsasync.fr`

Ces valeurs peuvent être modifiées dans [src/config.ts](src/config.ts).

## Sécurité

- Les tokens sont stockés de manière sécurisée via `context.secrets` de VSCode
- Les tokens Herald commencent toujours par `herald_`
- Le token est envoyé uniquement via HTTPS
- Vous pouvez révoquer un token à tout moment depuis le [dashboard web](https://app.itsasync.fr/dashboard/herald-tokens)

## Développement

### Structure du projet

```
src/
├── extension.ts          # Point d'entrée de l'extension
├── AsyncHeraldProvider.ts # Provider de la TreeView
├── auth.service.ts       # Service d'authentification
├── auth.flow.ts          # Flow OAuth
├── herald.service.ts     # Service d'analyse Herald
└── config.ts             # Configuration API
```

### Scripts

- `npm run compile` : Compile le TypeScript
- `npm run watch` : Compile en mode watch
- `npm run lint` : Vérifie le code avec ESLint
- `npm test` : Lance les tests

## Licence

MIT

## Support

Pour toute question ou problème, contactez l'équipe Async.
