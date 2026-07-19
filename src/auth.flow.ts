import * as vscode from 'vscode';
import { HERALD_CONFIG } from './config';
import { HeraldAuthService } from './auth.service';

export class HeraldAuthFlow {
  private authService: HeraldAuthService;

  constructor(authService: HeraldAuthService) {
    this.authService = authService;
  }

  async authenticate(): Promise<boolean> {
    try {
      // L'écran d'autorisation est servi par l'app web herald.codes (et non
      // plus par l'API), qui gère la connexion puis génère le jeton d'accès.
      const authUrl = `${HERALD_CONFIG.WEB_URL}${HERALD_CONFIG.AUTHORIZE_ENDPOINT}` +
        `?redirect_uri=${encodeURIComponent(HERALD_CONFIG.REDIRECT_URI)}`;

      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      const token = await this.waitForCallback();

      if (token) {
        await this.authService.saveToken(token);
        vscode.window.showInformationMessage('Authentification Herald réussie !');
        return true;
      }

      return false;
    } catch (error) {
      vscode.window.showErrorMessage(`Erreur d'authentification: ${error}`);
      return false;
    }
  }

  private async waitForCallback(): Promise<string | undefined> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 5 * 60 * 1000);

      const disposable = vscode.window.registerUriHandler({
        handleUri: (uri: vscode.Uri) => {
          if (uri.path === '/auth/callback') {
            clearTimeout(timeout);
            disposable.dispose();

            const token = new URLSearchParams(uri.query).get('token');
            resolve(token || undefined);
          }
        }
      });
    });
  }
}
