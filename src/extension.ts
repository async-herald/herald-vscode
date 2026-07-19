import * as vscode from 'vscode';
import { AsyncHeraldWebviewProvider } from './AsyncHeraldWebview';
import { HeraldAuthService } from './auth.service';
import { HeraldAuthFlow } from './auth.flow';
import { HeraldService } from './herald.service';
import { HERALD_CONFIG } from './config';
import { HeraldFileDecorationProvider } from './heraldFileDecorator';

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

  // Enregistrer le décorateur de fichiers pour herald.config.json
  const fileDecorator = new HeraldFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorator)
  );

  // Initialiser le contexte d'authentification
  vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', false);

  // Vérifier l'état d'authentification au démarrage
  checkAuthenticationStatus();

  // Watcher pour mettre à jour le compteur quand herald.config.json change
  if (vscode.workspace.workspaceFolders) {
    const pattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders[0],
      'herald.config.json'
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(async () => {
      if (await authService.isAuthenticated()) {
        const fileCount = await heraldService.countFiles();
        webviewProvider.setFileCount(fileCount);
      }
    });
    watcher.onDidChange(async () => {
      if (await authService.isAuthenticated()) {
        const fileCount = await heraldService.countFiles();
        webviewProvider.setFileCount(fileCount);
      }
    });
    watcher.onDidDelete(async () => {
      if (await authService.isAuthenticated()) {
        const fileCount = await heraldService.countFiles();
        webviewProvider.setFileCount(fileCount);
      }
    });

    context.subscriptions.push(watcher);
  }

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

      // Compter les fichiers qui seront analysés
      const fileCount = await heraldService.countFiles();
      webviewProvider.setFileCount(fileCount);

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

            if (result && result.success && result.analysis) {
              // 2. Analyse terminée
              progress.report({ increment: 100, message: 'Terminé !' });

              // Score officiel = celui du serveur (densité sur les totaux du dépôt),
              // le MÊME que le rapport en ligne. On NE moyenne PAS les familles : ça
              // diluerait un vrai problème derrière 5 familles saines (96 vs 77).
              // Fallback sur l'ancienne moyenne si un vieux serveur ne renvoie pas `scores`.
              const familyScores = Object.values(result.analysis.families).map(f => f.score);
              const score = result.analysis.scores?.overall
                ?? Math.round(familyScores.reduce((sum, s) => sum + s, 0) / familyScores.length);
              const grade = result.analysis.scores?.grade
                ?? (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F');
              const issuesCount = result.analysis.stats.issuesCount.total;
              const totalLines = result.analysis.stats.totalLines || 0;

              const heraldFamilies = {
                auriel: result.analysis.families.auriel.score,
                barachiel: result.analysis.families.barachiel.score,
                cassiel: result.analysis.families.cassiel.score,
                raziel: result.analysis.families.raziel.score,
                uriel: result.analysis.families.uriel.score,
                zadkiel: result.analysis.families.zadkiel.score
              };

              const issues = [
                ...result.analysis.families.auriel.issues,
                ...result.analysis.families.barachiel.issues,
                ...result.analysis.families.cassiel.issues,
                ...result.analysis.families.raziel.issues,
                ...result.analysis.families.uriel.issues,
                ...result.analysis.families.zadkiel.issues
              ];

              webviewProvider.setAnalysisResult(score, grade, issuesCount, totalLines, heraldFamilies, issues);
              vscode.window.showInformationMessage(
                `Analyse terminée ! Score: ${score}/100 (${grade}) - ${issuesCount} problème(s) détecté(s)`
              );
              context.globalState.update('lastReportId', result.reportId);

              // Rafraîchir les données d'utilisation et l'historique après l'analyse
              const usage = await heraldService.getUsage();
              if (usage) {
                webviewProvider.setUsageData(usage);
              }
              const history = await heraldService.getHistory();
              if (history) {
                webviewProvider.setHistoryData(history);
              }
            } else {
              // Erreur ou annulation
              console.error('❌ Analyse échouée ou annulée:', result);
              webviewProvider.setAnalyzing(false);

              const errorResult = result as any;

              // Déterminer le message d'erreur approprié
              let errorMessage = 'Erreur inconnue';

              if (result === null) {
                errorMessage = 'Aucune réponse du serveur (vérifiez votre connexion ou les logs)';
              } else if (errorResult?.error) {
                errorMessage = errorResult.error;
              } else if (!result.success) {
                errorMessage = `Échec de l'analyse (success: false)`;
              } else if (!result.analysis) {
                errorMessage = 'Réponse invalide: données d\'analyse manquantes';
              }

              vscode.window.showErrorMessage(`Erreur Herald: ${errorMessage}`);
              console.error('📋 Détails de l\'erreur:', {
                resultIsNull: result === null,
                hasError: !!errorResult?.error,
                hasSuccess: result?.success,
                hasAnalysis: !!result?.analysis,
                fullResult: result
              });

              // Vérifier si c'est une erreur de limite quotidienne
              if (errorResult?.error?.includes('Limite') || errorResult?.error?.includes('limit')) {
                const choice = await vscode.window.showWarningMessage(
                  'Limite quotidienne atteinte ! Passez Pro pour des analyses illimitées.',
                  'Devenir Pro'
                );
                if (choice === 'Devenir Pro') {
                  await vscode.env.openExternal(vscode.Uri.parse(`${HERALD_CONFIG.WEB_URL}/plans`));
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

      const reportUrl = `${HERALD_CONFIG.WEB_URL}/reports/${reportId}`;
      await vscode.env.openExternal(vscode.Uri.parse(reportUrl));
    })
  );

  // Commande: Télécharger le rapport (Pro uniquement)
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.downloadReport', async () => {
      const reportId = context.globalState.get<number>('lastReportId');

      if (!reportId) {
        vscode.window.showWarningMessage('Aucun rapport disponible');
        return;
      }

      const token = await authService.getToken();
      if (!token) {
        vscode.window.showErrorMessage('Veuillez vous authentifier d\'abord');
        return;
      }

      const format = await vscode.window.showQuickPick(
        [
          { label: 'PDF', description: 'Rapport complet avec graphiques', value: 'pdf' },
          { label: 'Markdown', description: 'Rapport au format texte', value: 'md' }
        ],
        { placeHolder: 'Choisissez le format du rapport' }
      );

      if (!format) {
        return;
      }

      const downloadUrl = `${HERALD_CONFIG.API_URL}/heralds/reports/${reportId}/export?format=${format.value}`;

      try {
        const response = await fetch(downloadUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          vscode.window.showErrorMessage(`Erreur lors du téléchargement: ${response.status}`);
          return;
        }

        const contentDisposition = response.headers.get('content-disposition') || '';
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        const defaultFilename = filenameMatch?.[1] || `herald-report-${reportId}.${format.value === 'md' ? 'md' : 'pdf'}`;

        const ext = format.value === 'md' ? 'md' : 'pdf';
        const filterLabel = format.value === 'md' ? 'Markdown' : 'PDF';

        const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || require('os').homedir();
        const defaultPath = require('path').join(baseDir, defaultFilename);

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(defaultPath),
          filters: { [filterLabel]: [ext] }
        });

        if (saveUri) {
          const buffer = Buffer.from(await response.arrayBuffer());
          await vscode.workspace.fs.writeFile(saveUri, buffer);
          const folderUri = vscode.Uri.file(require('path').dirname(saveUri.fsPath));
          const choice = await vscode.window.showInformationMessage(
            'Rapport téléchargé avec succès !',
            'Ouvrir le dossier'
          );
          if (choice === 'Ouvrir le dossier') {
            await vscode.env.openExternal(folderUri);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Erreur de téléchargement: ${errorMessage}`);
      }
    })
  );

  // Commande: Rafraîchir le compteur de fichiers
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.refreshFileCount', async () => {
      if (vscode.workspace.workspaceFolders) {
        const fileCount = await heraldService.countFiles();
        webviewProvider.setFileCount(fileCount);
        vscode.window.showInformationMessage(`Compteur mis à jour: ${fileCount} fichier(s)`);
      }
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

    // Compter les fichiers qui seront analysés
    if (vscode.workspace.workspaceFolders) {
      const fileCount = await heraldService.countFiles();
      webviewProvider.setFileCount(fileCount);
    }

    // Récupérer l'historique des rapports
    const history = await heraldService.getHistory();
    if (history) {
      webviewProvider.setHistoryData(history);
    }
  }
}

export function deactivate() {
  // Cleanup
}
