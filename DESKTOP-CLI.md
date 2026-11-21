# Analyse par Async Herald Desktop

L'extension n'analyse plus rien elle-même et n'envoie plus de fichiers à l'API :
elle lance **Async Herald Desktop** installé sur la machine, en mode ligne de
commande, et affiche le rapport qu'il renvoie. Ce document est le contrat entre
les deux.

## Où l'extension cherche l'app

1. Le réglage `asyncHerald.desktopPath` s'il est rempli (un `.app` sur macOS, ou
   l'exécutable `herald-desktop`).
2. Sinon, les emplacements habituels :
   - **macOS** : `/Applications/Async Herald.app`, puis `~/Applications/Async Herald.app`
     (exécutable `Contents/MacOS/herald-desktop`) ;
   - **Windows** : `%LOCALAPPDATA%\Programs\Async Herald\herald-desktop.exe`, puis
     `%ProgramFiles%\Async Herald\herald-desktop.exe` ;
   - **Linux** : `/usr/bin/herald-desktop` (paquet `.deb`), `/usr/local/bin`,
     `~/.local/bin`, puis le `PATH` (AppImage : indiquer son chemin dans le réglage).

Sur macOS, la version est lue dans `Info.plist` (`CFBundleShortVersionString`) :
en dessous de **0.2.1**, l'extension demande une mise à jour au lieu de lancer
l'app (une version ancienne ouvrirait sa fenêtre au lieu d'analyser).

## Commande

```bash
herald-desktop --analyze <dossier> --json
```

- Variable d'environnement `HERALD_HEADLESS=1` : aucune fenêtre ne doit s'ouvrir.
- L'app analyse le dossier avec le **même moteur et les mêmes règles** que dans sa
  fenêtre (règles de herald.codes, règles désactivées dans ses Réglages,
  `herald.config.json` du dépôt), décompte l'analyse du **quota du compte**
  connecté dans l'app et l'enregistre dans son **historique**.
- Pendant l'analyse, l'app écrit sa progression sur **stderr**, une ligne par
  étape : `PROGRESS <pourcentage> <message>`, par exemple
  `PROGRESS 60 Analyse des fichiers · 12 / 91`. Les autres lignes de stderr sont
  ignorées (gardées pour les messages d'erreur).
- La **première ligne `PROGRESS` doit arriver dans les 20 secondes** (par exemple
  `PROGRESS 0 Préparation`). Sans aucun signe passé ce délai, l'extension arrête
  l'app et indique que cette version ne sait pas analyser depuis VS Code : c'est
  ce qui arrive avec une version qui ignore `--analyze` (elle démarre normalement
  et ne s'arrête pas).
- À la fin, l'app écrit **un seul objet JSON sur stdout** puis s'arrête.

## Rapport (code de sortie 0)

```json
{
  "version": 1,
  "project": "Cutctus",
  "path": "/Users/me/Developpement/Cutctus",
  "analyzedAt": "2026-11-21T14:02:00Z",
  "durationMs": 2400,
  "score": 95,
  "grade": "A",
  "previousScore": 95,
  "files": 20,
  "categories": [
    { "id": "quality", "label": "Qualité", "score": 96, "grade": "A", "applicable": true }
  ],
  "issues": [
    {
      "rule": "long-line",
      "title": "Ligne trop longue",
      "severity": "warning",
      "category": "quality",
      "file": "src/game/Cactus.ts",
      "line": 71,
      "explanation": "Une ligne de plus de 120 caractères…",
      "fix": "Couper la ligne…"
    }
  ]
}
```

- `version` : format du rapport. L'extension refuse un format plus récent que
  celui qu'elle connaît (`1`) et demande sa propre mise à jour.
- `categories[].id` : `security`, `quality`, `git`, `devops`, `pattern`,
  `dependencies`, `tests`. `applicable: false` : rien à examiner dans ce projet.
- `issues` : problèmes **ouverts** (hors corrections cochées dans l'app).
  `file` est relatif au dossier analysé ; un relevé sans fichier (historique Git)
  a un `file` entre parenthèses, par exemple `(git)`.
- `previousScore` est absent à la première analyse.

## Erreur (code de sortie non nul)

```json
{ "error": "Quota du jour atteint : il revient demain.", "code": "quota" }
```

Codes attendus par l'extension : `not_signed_in` (propose d'ouvrir l'app),
`quota` (propose les offres), `no_files`, `invalid_path`. Tout autre code affiche
le message tel quel.

## Version

```bash
herald-desktop --version
```

Affiche la version (`0.2.1`) et s'arrête, sans ouvrir de fenêtre. Disponible
depuis la 0.2.1, première version avec `--analyze`.

## Ouvrir l'app sur un dossier

```bash
herald-desktop --open <dossier>
```

Ouvre la fenêtre de l'app sur ce projet (l'ajoute s'il n'y est pas). Sur macOS,
l'extension passe par `open -a "Async Herald.app" --args --open <dossier>`.
