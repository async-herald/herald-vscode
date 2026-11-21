export const HERALD_CONFIG = {
  // Site Herald : téléchargement d'Async Herald Desktop, liste des règles.
  WEB_URL: 'https://herald.codes',
  DOWNLOAD_URL: 'https://herald.codes/downloads',
  // Nom du bundle macOS installé dans /Applications.
  MAC_APP_NAME: 'Async Herald.app',
  // Première version d'Async Herald Desktop qui sait analyser en ligne de
  // commande (`--analyze <dossier> --json`).
  MIN_DESKTOP_VERSION: '0.2.0',
  ANALYZE_TIMEOUT_MS: 10 * 60 * 1000,
};
