# Interface utilisateur - Panneau Herald

Ce document décrit l'interface du panneau **Async Herald**, une webview affichée dans la barre latérale secondaire de VSCode.

## Vue d'ensemble

L'analyse se fait en local par **Async Herald Desktop** (voir [DESKTOP-CLI.md](DESKTOP-CLI.md)).
Le panneau dépend donc de la présence de l'app, suivie par le contexte
`asyncHerald.desktopState` (`missing`, `outdated` ou `ready`) :

- **App absente ou trop ancienne** → vue d'accueil (`viewsWelcome`) ;
- **App prête** → webview en **2 onglets** : **Analyse** et **Config**.

L'extension recherche l'app au démarrage, quand le réglage `asyncHerald.desktopPath`
change, et quand la fenêtre VS Code reprend le focus tant que l'app n'est pas trouvée
(l'utilisateur vient de l'installer).

---

## App absente

```
Async Herald analyse votre code sur votre machine : aucun fichier n'est envoyé.

L'analyse passe par l'app Async Herald Desktop. Installez-la, puis revenez ici.

[⬇ Télécharger Async Herald Desktop]   → async-herald.downloadDesktop (herald.codes/downloads)
[↻ J'ai installé l'app]                 → async-herald.checkDesktop
[📂 Indiquer l'emplacement de l'app]    → async-herald.locateDesktop
```

## App trop ancienne

Sur macOS, une version inférieure à 0.2.1 (lue dans `Info.plist`) ne sait pas analyser
en ligne de commande : la vue propose **« Mettre à jour Async Herald Desktop »**.

---

## En-tête

`Async Herald Desktop 0.2.1 · analyse locale` et un lien **« Ouvrir l'app »**
(`async-herald.openInDesktop`, ouvre l'app sur le dossier du projet).

## Onglet Analyse

- Bouton **« Analyser le projet »** (`async-herald.analyze`).
- Pendant l'analyse : le héraut céleste, la **progression réelle** envoyée par l'app
  (pourcentage et étape, par message `progress` à la webview, sans la redessiner) et le
  temps écoulé. Une notification VS Code montre la même progression et permet d'annuler.
- Résultats :
  - score sur 100 et note, écart avec l'analyse précédente, fichiers analysés, durée ;
  - **Catégories** (les plus touchées d'abord) : note, nombre de problèmes, barre ; un clic
    déplie les règles, avec gravité, explication, correction et emplacements cliquables
    (ouvre le fichier à la ligne) ;
  - **« Voir dans Async Herald »** ouvre l'app sur le projet.

Le dernier rapport du dossier est gardé dans le `workspaceState` et réaffiché au redémarrage.

## Onglet Config

Création et édition de `herald.config.json` à la racine (fichiers ignorés, règles
désactivées, seuils). L'app lit ce fichier à chaque analyse.

---

## Erreurs

| Code renvoyé par l'app | Réaction |
|---|---|
| `not_signed_in` | « Connectez-vous dans Async Herald Desktop… » + **Ouvrir Async Herald** |
| `quota` | message de l'app + **Voir les offres** |
| `cancelled` | rien (annulation par l'utilisateur) |
| autre, ou app introuvable / sortie illisible | message d'erreur tel quel |

## Commandes

```
> Async Herald : Analyser le projet                          → async-herald.analyze
> Async Herald : Ouvrir dans Async Herald Desktop             → async-herald.openInDesktop
> Async Herald : Rechercher Async Herald Desktop              → async-herald.checkDesktop
> Async Herald : Télécharger Async Herald Desktop             → async-herald.downloadDesktop
> Async Herald : Indiquer l'emplacement d'Async Herald Desktop → async-herald.locateDesktop
> Async Herald : Ouvrir le menu                              → async-herald.menu
```

## Réglage

| Réglage | Rôle |
|---|---|
| `asyncHerald.desktopPath` | Emplacement de l'app (`.app` ou exécutable) si elle n'est pas à sa place habituelle |
