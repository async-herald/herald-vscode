import * as vscode from 'vscode';
import { AsyncHeraldWebviewProvider } from './AsyncHeraldWebview';
import { HeraldAuthService } from './auth.service';
import { HeraldAuthFlow } from './auth.flow';
import { HeraldService, Issue } from './herald.service';
import { HERALD_CONFIG } from './config';
import { HeraldFileDecorationProvider } from './heraldFileDecorator';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let webviewProvider: AsyncHeraldWebviewProvider;
let authService: HeraldAuthService;
let authFlow: HeraldAuthFlow;
let heraldService: HeraldService;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('Async Herald activated');
  authService = new HeraldAuthService(context);
  authFlow = new HeraldAuthFlow(authService);
  heraldService = new HeraldService(authService);
  webviewProvider = new AsyncHeraldWebviewProvider(context.extensionUri, authService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('asyncHeraldView', webviewProvider)
  );

  // Ajoute le badge 'H' orange sur les fichiers de configuration pour les identifier visuellement
  const fileDecorator = new HeraldFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorator)
  );
  
  // Permet d'afficher les erreurs directement dans l'éditeur (squiggles rouges)
  diagnosticCollection = vscode.languages.createDiagnosticCollection('async-herald');
  context.subscriptions.push(diagnosticCollection);

  // Garde le score global sous les yeux de l'utilisateur à tout moment
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'async-herald.analyze';
  statusBarItem.text = '$(shield) Herald: --';
  statusBarItem.tooltip = 'Score Async Herald';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', false);
  checkAuthenticationStatus();

  // Garantit que le Webview affiche toujours un compteur exact si l'utilisateur modifie ses exclusions à la main
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
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.menu', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.async-herald-secondary');
      vscode.window.showInformationMessage('Ouverture du menu Herald');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.connect', async () => {
      const result = await authFlow.authenticate();
      if (result) {
        await checkAuthenticationStatus();
      }
    })
  );
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
        diagnosticCollection.clear();
        statusBarItem.text = '$(shield) Herald: --';
        await vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', false);
        vscode.window.showInformationMessage('Déconnecté de Herald');
      }
    })
  );
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
  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.analyzeActiveFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Aucun fichier actif à analyser');
        return;
      }
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        const choice = await vscode.window.showWarningMessage('Vous devez vous connecter pour utiliser Herald', 'Se connecter');
        if (choice === 'Se connecter') await vscode.commands.executeCommand('async-herald.connect');
        return;
      }

      webviewProvider.setAnalyzing(true);
      statusBarItem.text = '$(sync~spin) Herald: Analyzing...';

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Analyse du fichier...', cancellable: false },
          async (progress) => {
            diagnosticCollection.clear();
            const result = await heraldService.analyzeSpecificFiles([editor.document.uri]);
            await handleAnalysisResult(result, context);
          }
        );
      } catch (error) {
        webviewProvider.setAnalyzing(false);
        statusBarItem.text = '$(shield) Herald: Error';
        throw error;
      }
    })
  );
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
      const fileCount = await heraldService.countFiles();
      webviewProvider.setFileCount(fileCount);
      webviewProvider.setAnalyzing(true);
      statusBarItem.text = '$(sync~spin) Herald: Analyzing...';

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Analyse Herald',
            cancellable: false
          },
          async (progress) => {
            progress.report({ increment: 0, message: 'Collecte des fichiers...' });
            diagnosticCollection.clear();

            let result;
            const isDiffAnalysis = vscode.workspace.getConfiguration('asyncHerald').get<boolean>('analyzeOnlyDiffs', false);

            if (isDiffAnalysis && vscode.workspace.workspaceFolders) {
              const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
              const lastCommitId = context.workspaceState.get<string>('lastCommitId');
              
              try {
                const { stdout: currentHead } = await execAsync('git rev-parse HEAD', { cwd: rootPath });
                const newCommitId = currentHead.trim();

                if (!lastCommitId) {
                  vscode.window.showInformationMessage('Baseline Git établie. Prochaine analyse ciblée sur les diffs.');
                  result = await heraldService.analyzeWorkspace();
                } else {
                  const { stdout: diffOutput } = await execAsync(`git diff --name-only ${lastCommitId} HEAD`, { cwd: rootPath });
                  const modifiedFiles = diffOutput.trim().split('\n').filter(f => f);
                  const diffUris = modifiedFiles.map(f => vscode.Uri.file(require('path').join(rootPath, f)));
                  
                  const { stdout: untrackedOutput } = await execAsync(`git ls-files --others --exclude-standard`, { cwd: rootPath });
                  const untrackedFiles = untrackedOutput.trim().split('\n').filter(f => f);
                  const untrackedUris = untrackedFiles.map(f => vscode.Uri.file(require('path').join(rootPath, f)));
                  
                  const allUris = [...diffUris, ...untrackedUris];
                  
                  if (allUris.length === 0) {
                    vscode.window.showInformationMessage('Aucune modification détectée depuis la dernière analyse.');
                    webviewProvider.setAnalyzing(false);
                    statusBarItem.text = '$(shield) Herald: Up to date';
                    return;
                  }
                  
                  result = await heraldService.analyzeSpecificFiles(allUris);
                }

                if (result && result.success) {
                  await context.workspaceState.update('lastCommitId', newCommitId);
                }
              } catch (err) {
                console.error('Git error', err);
                vscode.window.showWarningMessage('Erreur Git ou pas de dépôt. Analyse complète effectuée.');
                result = await heraldService.analyzeWorkspace();
              }
            } else {
              result = await heraldService.analyzeWorkspace();
            }

            await handleAnalysisResult(result, context);
          }
        );
      } catch (error) {
        webviewProvider.setAnalyzing(false);
        statusBarItem.text = '$(shield) Herald: Error';
        throw error;
      }
    })
  );
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

async function handleAnalysisResult(result: any, context: vscode.ExtensionContext) {
  if (result && result.success && result.analysis) {
    const familyScores = Object.values(result.analysis.families).map((f: any) => f.score);
    const score = result.analysis.scores?.overall
      ?? Math.round(familyScores.reduce((sum: number, s: number) => sum + s, 0) / familyScores.length);
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

    const issues: Issue[] = [
      ...result.analysis.families.auriel.issues,
      ...result.analysis.families.barachiel.issues,
      ...result.analysis.families.cassiel.issues,
      ...result.analysis.families.raziel.issues,
      ...result.analysis.families.uriel.issues,
      ...result.analysis.families.zadkiel.issues
    ];

    webviewProvider.setAnalysisResult(score, grade, issuesCount, totalLines, heraldFamilies, issues);
    statusBarItem.text = `$(shield) Herald: ${grade} (${score})`;
    vscode.window.showInformationMessage(
      `Analyse terminée ! Score: ${score}/100 (${grade}) - ${issuesCount} problème(s) détecté(s)`
    );
    context.globalState.update('lastReportId', result.reportId);
    updateDiagnostics(issues);

    const usage = await heraldService.getUsage();
    if (usage) {
      webviewProvider.setUsageData(usage);
    }
    const history = await heraldService.getHistory();
    if (history) {
      webviewProvider.setHistoryData(history);
    }
  } else {
    console.error('❌ Analyse échouée ou annulée:', result);
    webviewProvider.setAnalyzing(false);
    statusBarItem.text = '$(shield) Herald: Error';

    const errorResult = result as any;
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

function updateDiagnostics(issues: Issue[]) {
  if (!vscode.workspace.workspaceFolders) return;
  const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  
  
  const issuesByFile = new Map<string, vscode.Diagnostic[]>();
  
  for (const issue of issues) {
    if (!issue.file) continue;
    
    
    const fileUri = vscode.Uri.file(require('path').join(rootPath, issue.file));
    const uriStr = fileUri.toString();
    
    // Les index de l'éditeur commencent à 0, tandis que le moteur externe compte à partir de 1
    const line = issue.line ? Math.max(0, issue.line - 1) : 0;
    const col = issue.column ? Math.max(0, issue.column - 1) : 0;
    
    const range = new vscode.Range(line, col, line, col + 100); // Sélectionne toute la ligne visuellement pour l'affichage du diagnostic
    
    let severity = vscode.DiagnosticSeverity.Information;
    if (issue.severity === 'critical') severity = vscode.DiagnosticSeverity.Error;
    else if (issue.severity === 'warning') severity = vscode.DiagnosticSeverity.Warning;
    
    const diagnostic = new vscode.Diagnostic(
      range,
      `[${issue.family}] ${issue.title} - ${issue.message}`,
      severity
    );
    diagnostic.source = 'Async Herald';
    diagnostic.code = issue.rule;
    
    if (!issuesByFile.has(uriStr)) {
      issuesByFile.set(uriStr, []);
    }
    issuesByFile.get(uriStr)!.push(diagnostic);
  }
  
  
  for (const [uriStr, fileDiagnostics] of issuesByFile.entries()) {
    diagnosticCollection.set(vscode.Uri.parse(uriStr), fileDiagnostics);
  }
}

async function checkAuthenticationStatus() {
  const isAuth = await authService.isAuthenticated();
  await vscode.commands.executeCommand('setContext', 'asyncHerald.authenticated', isAuth);

  if (isAuth) {
    const userInfo = await authService.getUserInfo();
    webviewProvider.setUserEmail(userInfo?.email);
    const usage = await heraldService.getUsage();
    if (usage) {
      webviewProvider.setUsageData(usage);
    }
    if (vscode.workspace.workspaceFolders) {
      const fileCount = await heraldService.countFiles();
      webviewProvider.setFileCount(fileCount);
    }
    const history = await heraldService.getHistory();
    if (history) {
      webviewProvider.setHistoryData(history);
    }
  }
}

export function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.dispose();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
