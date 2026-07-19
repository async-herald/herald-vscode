# Interface utilisateur - Panneau Herald

Ce document décrit l'interface du panneau **Async Herald**, une webview affichée dans la barre latérale secondaire de VSCode.

## Vue d'ensemble

Le panneau est une webview HTML personnalisée. Une fois connecté, il s'organise en **3 onglets** :

- **Analyse** — score, note et problèmes détectés
- **Usage** — plan, quota et fichiers analysés
- **Config** — édition de `herald.config.json`

Tant que l'utilisateur n'est pas authentifié, une vue d'accueil (`viewsWelcome`) invite à se connecter.

---

## État non connecté

VSCode affiche la vue d'accueil déclarée dans `package.json` :

```
Bienvenue sur Async Herald !

Analysez la qualité de votre code en quelques secondes.

[🔌 Lier mon compte]
[🔑 Entrer un token]
```

**Actions disponibles** :
- **Lier mon compte** → `async-herald.connect` (flow OAuth, recommandé)
- **Entrer un token** → `async-herald.setToken` (token manuel)

---

## Onglet « Analyse »

C'est l'onglet par défaut une fois connecté.

### En-tête
- Icône de déconnexion (survol : « Se déconnecter »)
- Barre d'onglets : **Analyse** · Usage · Config

### Actions
- **Devenir Pro** — ouvre `herald.codes/plans`
- **Analyser le projet** — lance `async-herald.analyze` (désactivé pendant une analyse en cours)

### Résultats d'analyse
Après une analyse :
- **Score global** sur 100 et **note** (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, sinon F)
- Nombre de **problèmes détectés** et **lignes analysées**
- Problèmes regroupés par **famille Herald**, chaque catégorie étant repliable
- Chaque problème affiche sa **sévérité** (critical / warning / info) et sa **localisation cliquable** : un clic ouvre le fichier à la ligne/colonne exacte

### Rapport
- **Voir le rapport complet** — ouvre `herald.codes/reports/{reportId}` dans le navigateur
- **Télécharger le rapport** — export PDF / Markdown (comptes Pro ; sinon renvoie vers la page Pro)

---

## Les 6 familles Herald

Les problèmes sont regroupés par « héraut », chacun couvrant une dimension :

| Famille | Libellé | Couleur | Rôle |
|---------|---------|---------|------|
| `auriel` | Auriel - Architecture | `#8B5CF6` | Analyse l'architecture du code |
| `barachiel` | Barachiel - Performance | `#10B981` | Détecte les memory leaks et goulots |
| `cassiel` | Cassiel - Patterns IA | `#F59E0B` | Identifie le code IA non optimisé |
| `raziel` | Raziel - Documentation | `#06B6D4` | Vérifie la documentation et les tests |
| `uriel` | Uriel - Sécurité | `#EF4444` | Traque les failles de sécurité |
| `zadkiel` | Zadkiel - Qualité | `#3B82F6` | Inspecte la qualité globale du code |

---

## Onglet « Usage »

Affiche les informations de compte et de quota (récupérées via l'API) :

| Élément | Valeur |
|---------|--------|
| **Plan** | `⭐ Pro` ou `Gratuit` |
| **Analyses restantes (jour)** | `Illimité` (Pro) ou le compte quotidien restant |
| **Limite de débit** | Requêtes restantes + délai de réinitialisation |
| **Fichiers à analyser** | Compteur, avec un bouton de rafraîchissement |

Un bouton **Devenir Pro** est présent pour les comptes gratuits. Un raccourci permet d'ouvrir l'onglet **Config**.

Le compteur de fichiers se met à jour automatiquement lorsque `herald.config.json` est créé, modifié ou supprimé.

---

## Onglet « Config »

Gère le fichier `herald.config.json` à la racine du workspace.

### Sans fichier de config
- Bouton **Créer herald.config.json**
- Exemple de configuration et description des options disponibles

### Avec un fichier de config
Formulaire d'édition :
- **Fichiers à ignorer** (un par ligne, patterns glob : `*`, `**`, `*.ext`)
- **Règles désactivées** (IDs séparés par des virgules ; lien « Voir les règles »)
- **Lignes max par fichier** (`thresholds.maxFileLines`, défaut : 300)
- **Sauvegarder** (écrit le fichier) et **Éditer JSON** (ouvre le fichier brut)

### Structure du fichier

```json
{
  "ignore": [
    "docs",
    "src/generated",
    "**/*.min.js"
  ],
  "rules": {
    "disable": ["eval-usage"]
  },
  "thresholds": {
    "maxFileLines": 500
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `ignore` | `string[]` | Fichiers et dossiers à exclure (glob) |
| `rules.disable` | `string[]` | IDs de règles à désactiver |
| `thresholds.maxFileLines` | `number` | Nombre max de lignes par fichier (défaut : 300) |

---

## Flow utilisateur complet

### 1. Connexion

```
1. User ouvre le panneau Async Herald (barre latérale secondaire)
   ↓
2. Vue d'accueil : « Lier mon compte » ou « Entrer un token »
   ↓
3a. OAuth (recommandé)
    - Le navigateur s'ouvre sur herald.codes/herald/authorize
    - User se connecte et autorise
    - Redirection vers vscode://async.async-herald/auth/callback avec le token
3b. Token manuel
    - InputBox : le token doit commencer par « herald_ »
    - Stockage sécurisé (context.secrets)
   ↓
4. Le panneau bascule sur la vue connectée (onglet Analyse)
```

### 2. Analyse

```
1. User clique « Analyser le projet »
   ↓
2. Notification de progression : « Collecte des fichiers... »
   ↓
3. L'extension collecte les fichiers et les envoie à l'API Herald
   ↓
4. Réception des résultats → onglet Analyse mis à jour
   ↓
5. Notification : « Analyse terminée ! Score: XX/100 (Grade) - X problème(s) »
   ↓
6. Usage et historique rafraîchis en arrière-plan
```

En cas de **limite quotidienne atteinte**, une notification propose de **Devenir Pro** (ouvre `herald.codes/plans`).

### 3. Consultation du rapport

```
1. User clique « Voir le rapport complet »
   ↓
2. Le navigateur ouvre herald.codes/reports/{reportId}
```

---

## Messages de notification

| Message | Type | Déclencheur |
|---------|------|-------------|
| « Authentification Herald réussie ! » | Info | Connexion OAuth réussie |
| « Token Herald enregistré avec succès ! » | Info | Token manuel défini |
| « Voulez-vous vraiment vous déconnecter ? » | Warning (modal) | Déconnexion |
| « Déconnecté de Herald » | Info | Déconnexion confirmée |
| « Analyse Herald » / « Collecte des fichiers... » | Progress | Pendant l'analyse |
| « Analyse terminée ! Score: XX/100 (Grade) - X problème(s) » | Info | Fin d'analyse |
| « Vous devez vous connecter pour utiliser Herald » | Warning | Analyse sans auth |
| « Le token ne peut pas être vide » | Error | Token vide |
| « Le token doit commencer par 'herald_' » | Error | Format token invalide |
| « Limite quotidienne atteinte ! Passez Pro… » | Warning | Quota gratuit dépassé |
| « Aucun rapport disponible » | Warning | Clic sur rapport sans analyse |
| « Rapport téléchargé avec succès ! » | Info | Export PDF/MD réussi |
| « Compteur mis à jour: X fichier(s) » | Info | Rafraîchissement manuel |

---

## Commandes (Cmd/Ctrl + Shift + P)

```
> Async Herald : Lier mon compte              → async-herald.connect
> Async Herald : Définir le token manuellement → async-herald.setToken
> Async Herald : Se déconnecter               → async-herald.disconnect
> Async Herald : Analyser le projet           → async-herald.analyze
> Async Herald : Voir le rapport complet      → async-herald.openReport
> Async Herald : Ouvrir le menu               → async-herald.menu
```

Commandes internes (non listées dans la palette) : `async-herald.downloadReport`, `async-herald.refreshFileCount`.

---

## Persistance des données

### Stockées de manière sécurisée (`context.secrets`)
- Token Herald (OAuth ou manuel)

### Stockées dans `globalState`
- ID du dernier rapport (`lastReportId`)

### État en mémoire (provider)
- Email utilisateur, données d'usage, historique, dernière analyse, compteur de fichiers

Au redémarrage de VSCode, l'extension vérifie le token puis recharge l'email, l'usage, l'historique et le compteur de fichiers via l'API.

---

## Configuration technique

| Clé | Valeur |
|-----|--------|
| API | `https://api.herald.codes` |
| Web | `https://herald.codes` |
| Écran d'autorisation | `herald.codes/herald/authorize` |
| Redirect URI | `vscode://async.async-herald/auth/callback` |
| Vue | `asyncHeraldView` (webview) dans `async-herald-secondary` |
