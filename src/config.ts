export const HERALD_CONFIG = {
  // Site Herald : téléchargement d'Async Herald Desktop, liste des règles.
  WEB_URL: 'https://herald.codes',
  DOWNLOAD_URL: 'https://herald.codes/downloads',
  // Cask Homebrew de l'app (macOS) : mise à jour par `brew upgrade --cask`.
  HOMEBREW_CASK: 'async-herald/tap/herald',
  // Nom du bundle macOS installé dans /Applications.
  MAC_APP_NAME: 'Async Herald.app',
  // Première version d'Async Herald Desktop qui sait analyser en ligne de
  // commande (`--analyze <dossier> --json`). À garder identique au texte de la
  // vue d'accueil « trop ancienne » dans package.json (viewsWelcome).
  MIN_DESKTOP_VERSION: '0.2.0',
  ANALYZE_TIMEOUT_MS: 10 * 60 * 1000,
};
