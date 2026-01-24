import * as vscode from 'vscode';
import { AsyncHeraldWebviewProvider } from './AsyncHeraldWebview';
import { HeraldAuthService } from './auth.service';
import { HeraldAuthFlow } from './auth.flow';
import { HeraldService } from './herald.service';
import { HERALD_CONFIG } from './config';

let webviewProvider: AsyncHeraldWebviewProvider;
let authService: HeraldAuthService;
let authFlow: HeraldAuthFlow;
let heraldService: HeraldService;

export function activate(context: vscode.ExtensionContext) {
  console.log('Async Herald activated');

  // Initialiser les services
  authService = new HeraldAuthService(context);
  authFlow = new HeraldAuthFlow(authService);
  heraldService = new HeraldService(authService);

  // Créer le WebviewView provider
  webviewProvider = new AsyncHeraldWebviewProvider(context.extensionUri, authService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('asyncHeraldView', webviewProvider)
  );

  // Initialiser le contexte d'authentification
  vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', false);

  // Vérifier l'état d'authentification au démarrage
  checkAuthenticationStatus();

  // Commande: Ouvrir le menu Herald
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.menu', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.async-herald-secondary');
      vscode.window.showInformationMessage('Ouverture du menu Herald');
    })
  );

  // Commande: Se connecter
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.connect', async () => {
      const result = await authFlow.authenticate();
      if (result) {
        await checkAuthenticationStatus();
      }
    })
  );

  // Commande: Se déconnecter
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.disconnect', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Voulez-vous vraiment vous déconnecter ?',
        { modal: true },
        'Se déconnecter'
      );

      if (confirm === 'Se déconnecter') {
        await authService.clearToken();
        webviewProvider.clearAnalysisResult();
        await vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', false);
        vscode.window.showInformationMessage('Déconnecté de Herald');
      }
    })
  );

  // Commande: Définir le token manuellement
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.setToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Entrez votre token Herald',
        placeHolder: 'herald_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        password: true,
        validateInput: (value) => {
          if (!value) {
            return 'Le token ne peut pas être vide';
          }
          if (!value.startsWith('herald_')) {
            return 'Le token doit commencer par "herald_"';
          }
          return null;
        }
      });

      if (token) {
        await authService.saveToken(token);
        await checkAuthenticationStatus();
        vscode.window.showInformationMessage('Token Herald enregistré avec succès !');
      }
    })
  );

  // Commande: Analyser le projet
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.analyze', async () => {
      const isAuth = await authService.isAuthenticated();

      if (!isAuth) {
        const choice = await vscode.window.showWarningMessage(
          'Vous devez vous connecter pour utiliser Herald',
          'Se connecter'
        );

        if (choice === 'Se connecter') {
          await vscode.commands.executeCommand('async-herald.connect');
        }
        return;
      }

      // Activer l'état de chargement
      webviewProvider.setAnalyzing(true);

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Analyse Herald',
            cancellable: false
          },
          async (progress) => {
            // 1. Collecte des fichiers
            progress.report({ increment: 0, message: 'Collecte des fichiers...' });

            const result = await heraldService.analyzeWorkspace();

            // Debug: afficher la réponse complète
            console.log('📊 Réponse API Herald:', JSON.stringify(result, null, 2));

            if (result?.success) {
              // 2. Analyse terminée
              progress.report({ increment: 100, message: 'Terminé !' });

              // Vérifications de sécurité
              if (!result.analysis || !result.analysis.scores || !result.analysis.stats) {
                console.error('❌ Structure de réponse invalide:', result);
                vscode.window.showErrorMessage('Erreur: Réponse API invalide');
                webviewProvider.setAnalyzing(false);
                return;
              }

              const score = result.analysis.scores.overall;
              const grade = result.analysis.scores.grade;
              const issuesCount = result.analysis.stats.issuesCount.total;
              const totalLines = result.analysis.stats.totalLines;
              const categories = heraldService.mapToSixCategories(result.analysis.scores);
              const issues = result.analysis.issues || [];

              webviewProvider.setAnalysisResult(score, grade, issuesCount, totalLines, categories, issues);

              vscode.window.showInformationMessage(
                `Analyse terminée ! Score: ${score}/100 (${grade}) - ${issuesCount} problème(s) détecté(s)`
              );

              // Stocker le reportId pour l'ouvrir plus tard
              context.globalState.update('lastReportId', result.reportId);

              // Rafraîchir les données d'utilisation après l'analyse
              const usage = await heraldService.getUsage();
              if (usage) {
                webviewProvider.setUsageData(usage);
              }
            } else {
              // Erreur ou annulation
              console.error('❌ Analyse échouée ou annulée:', result);
              webviewProvider.setAnalyzing(false);

              // Vérifier si c'est une erreur de limite quotidienne
              const errorResult = result as { error?: string };
              if (errorResult?.error?.includes('Limite') || errorResult?.error?.includes('limit')) {
                const choice = await vscode.window.showWarningMessage(
                  'Limite quotidienne atteinte ! Passez Pro pour des analyses illimitées.',
                  'Devenir Pro'
                );
                if (choice === 'Devenir Pro') {
                  await vscode.env.openExternal(vscode.Uri.parse('https://app.itsasync.fr/pro'));
                }
              }
            }
          }
        );
      } catch (error) {
        // En cas d'erreur, désactiver le chargement
        webviewProvider.setAnalyzing(false);
        throw error;
      }
    })
  );

  // Commande: Ouvrir le rapport complet
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.openReport', async () => {
      const reportId = context.globalState.get<number>('lastReportId');

      if (!reportId) {
        vscode.window.showWarningMessage('Aucun rapport disponible');
        return;
      }

      const reportUrl = `https://app.itsasync.fr/herald/reports?id=${reportId}`;
      await vscode.env.openExternal(vscode.Uri.parse(reportUrl));
    })
  );
}

async function checkAuthenticationStatus() {
  const isAuth = await authService.isAuthenticated();

  // Mettre à jour le contexte VSCode pour contrôler quelle vue afficher
  await vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', isAuth);

  if (isAuth) {
    const userInfo = await authService.getUserInfo();
    webviewProvider.setUserEmail(userInfo?.email);

    // Récupérer les données d'utilisation
    const usage = await heraldService.getUsage();
    if (usage) {
      webviewProvider.setUsageData(usage);
    }
  }
}

export function deactivate() {
  // Cleanup
}
