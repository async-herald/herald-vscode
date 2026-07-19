export const HERALD_CONFIG = {
  // API Herald (analyse, rapports, jetons…) — backend async-herald-rust.
  API_URL: 'https://api.herald.codes',
  // Application web Herald : sert l'écran d'autorisation « Lier mon compte ».
  WEB_URL: 'https://herald.codes',
  REDIRECT_URI: 'vscode://async.async-herald/auth/callback',
  AUTHORIZE_ENDPOINT: '/herald/authorize',
  TOKEN_KEY: 'herald_token'
};
