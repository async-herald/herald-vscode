import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { AsyncHeraldWebviewProvider, DesktopStatus } from './AsyncHeraldWebview';
import { HERALD_CONFIG } from './config';
import { HeraldFileDecorationProvider } from './heraldFileDecorator';
import { DesktopInstall, analyzeWithDesktop, findDesktop, openDesktop, supportsCli } from './desktop';
import { DesktopReport, isDesktopError } from './report';

/** Dernier rapport du dossier ouvert (gardé d'une session à l'autre). */
const LAST_REPORT_KEY = 'asyncHerald.lastReport';

let webviewProvider: AsyncHeraldWebviewProvider;
let desktop: DesktopInstall | undefined;
/** Vue d'accueil (app absente ou trop ancienne) : son message donne les versions. */
let welcomeView: vscode.TreeView<never> | undefined;

export function activate(context: vscode.ExtensionContext) {
  webviewProvider = new AsyncHeraldWebviewProvider(context.extensionUri);
  // Vue d'accueil sans contenu : VS Code y affiche le texte de `viewsWelcome`,
  // et son message donne la version installée et la version requise.
  welcomeView = vscode.window.createTreeView<never>('asyncHeraldWelcome', {
    treeDataProvider: { getChildren: () => [], getTreeItem: item => item },
  });
  context.subscriptions.push(welcomeView);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('asyncHeraldView', webviewProvider)
  );
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new HeraldFileDecorationProvider())
  );

  const lastReport = context.workspaceState.get<DesktopReport>(LAST_REPORT_KEY);
  if (lastReport) {
    webviewProvider.setReport(lastReport);
  }

  checkDesktop();

  // Chemin changé dans les réglages, ou retour dans VS Code après une
  // installation : on recherche l'app.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('asyncHerald.desktopPath')) {
        checkDesktop();
      }
    }),
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused && !isReady()) {
        checkDesktop();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('async-herald.menu', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.async-herald-secondary');
    }),

    vscode.commands.registerCommand('async-herald.checkDesktop', async () => {
      const status = await checkDesktop();
      if (status.state === 'ready') {
        vscode.window.showInformationMessage(
          `Async Herald Desktop ${status.version ?? ''} trouvé : l'analyse se fera sur cette machine.`
        );
      } else {
        await promptInstall(status);
      }
    }),

    vscode.commands.registerCommand('async-herald.downloadDesktop', async () => {
      await vscode.env.openExternal(vscode.Uri.parse(HERALD_CONFIG.DOWNLOAD_URL));
    }),

    vscode.commands.registerCommand('async-herald.updateDesktop', async () => {
      // Installée avec Homebrew : mise à jour dans un terminal, puis nouvelle
      // recherche quand le terminal se ferme. Sinon : page de téléchargement.
      if (await installedWithHomebrew()) {
        const terminal = vscode.window.createTerminal({ name: 'Async Herald : mise à jour' });
        terminal.show();
        terminal.sendText(`brew upgrade --cask ${HERALD_CONFIG.HOMEBREW_CASK} && exit`);
        const closed = vscode.window.onDidCloseTerminal(async t => {
          if (t === terminal) {
            closed.dispose();
            const status = await checkDesktop();
            if (status.state === 'ready') {
              vscode.window.showInformationMessage(
                `Async Herald Desktop ${status.version ?? ''} est à jour : vous pouvez analyser.`
              );
            }
          }
        });
        context.subscriptions.push(closed);
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(HERALD_CONFIG.DOWNLOAD_URL));
    }),

    vscode.commands.registerCommand('async-herald.locateDesktop', async () => {
      const picked = await vscode.window.showOpenDialog({
        title: 'Où est installé Async Herald Desktop ?',
        openLabel: 'Utiliser',
        canSelectFiles: true,
        // Un `.app` est un dossier pour le sélecteur macOS.
        canSelectFolders: process.platform === 'darwin',
        canSelectMany: false,
        defaultUri: vscode.Uri.file(process.platform === 'darwin' ? '/Applications' : require('os').homedir()),
      });
      if (!picked?.[0]) {
        return;
      }
      await vscode.workspace
        .getConfiguration('asyncHerald')
        .update('desktopPath', picked[0].fsPath, vscode.ConfigurationTarget.Global);
      const status = await checkDesktop();
      if (status.state !== 'ready') {
        await promptInstall(status);
      }
    }),

    vscode.commands.registerCommand('async-herald.openInDesktop', async () => {
      if (!desktop) {
        await promptInstall(await checkDesktop());
        return;
      }
      openDesktop(desktop, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    }),

    vscode.commands.registerCommand('async-herald.analyze', async () => {
      const status = await checkDesktop();
      if (!desktop || status.state !== 'ready') {
        await promptInstall(status);
        return;
      }
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showWarningMessage('Ouvrez un dossier de projet pour l\'analyser.');
        return;
      }
      const install = desktop;

      webviewProvider.setAnalyzing(true);
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Analyse Herald (locale)',
          cancellable: true,
        },
        async (progress, token) => {
          let last = 0;
          return analyzeWithDesktop(
            install,
            folder.uri.fsPath,
            (percent, message) => {
              progress.report({ increment: Math.max(0, percent - last), message });
              last = Math.max(last, percent);
              webviewProvider.setProgress(percent, message);
            },
            token
          );
        }
      );

      if (isDesktopError(result)) {
        webviewProvider.setAnalyzing(false);
        await showAnalysisError(result.error, result.code);
        return;
      }

      webviewProvider.setReport(result);
      await context.workspaceState.update(LAST_REPORT_KEY, result);
      const issues = result.issues.length;
      vscode.window.showInformationMessage(
        `Analyse terminée : ${result.score}/100 (${result.grade}), ${issues} problème${issues > 1 ? 's' : ''}.`
      );
    })
  );
}

function isReady(): boolean {
  return !!desktop && supportsCli(desktop);
}

/** Cherche l'app et met à jour le panneau et la vue d'accueil. */
async function checkDesktop(): Promise<DesktopStatus> {
  desktop = await findDesktop();
  const status: DesktopStatus = !desktop
    ? { state: 'missing' }
    : {
        state: supportsCli(desktop) ? 'ready' : 'outdated',
        version: desktop.version,
        path: desktop.bundle ?? desktop.executable,
      };
  await vscode.commands.executeCommand('setContext', 'asyncHerald.desktopState', status.state);
  // Version installée dans l'en-tête de la vue (un `message` masquerait les
  // boutons de la vue d'accueil).
  if (welcomeView) {
    welcomeView.description =
      status.state === 'outdated' ? `${status.version ?? 'version inconnue'} installée` : undefined;
  }
  webviewProvider?.setDesktopStatus(status);
  return status;
}

/** Explique qu'il faut installer (ou mettre à jour) Async Herald Desktop. */
async function promptInstall(status: DesktopStatus): Promise<void> {
  const message =
    status.state === 'outdated'
      ? `Async Herald Desktop ${status.version} est trop ancien pour analyser depuis VS Code : installez la version ${HERALD_CONFIG.MIN_DESKTOP_VERSION} ou plus récente.`
      : 'L\'analyse se fait sur votre machine avec Async Herald Desktop. Installez l\'app pour analyser ce projet.';
  const choice = await vscode.window.showWarningMessage(
    message,
    status.state === 'outdated' ? 'Mettre à jour' : 'Télécharger',
    'Indiquer l\'emplacement'
  );
  if (choice === 'Mettre à jour') {
    await vscode.commands.executeCommand('async-herald.updateDesktop');
  } else if (choice === 'Télécharger') {
    await vscode.commands.executeCommand('async-herald.downloadDesktop');
  } else if (choice === 'Indiquer l\'emplacement') {
    await vscode.commands.executeCommand('async-herald.locateDesktop');
  }
}

/** Vrai si l'app a été installée avec Homebrew (macOS) : `brew list --cask` la connaît. */
function installedWithHomebrew(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    execFile(
      'brew',
      ['list', '--cask', HERALD_CONFIG.HOMEBREW_CASK],
      // VS Code lancé depuis le Dock n'a pas toujours Homebrew dans son PATH.
      { timeout: 10_000, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` } },
      err => resolve(!err)
    );
  });
}

/** Message adapté à l'erreur renvoyée par l'app. */
async function showAnalysisError(error: string, code?: string): Promise<void> {
  switch (code) {
    case 'cancelled':
      return;
    case 'not_signed_in': {
      const choice = await vscode.window.showWarningMessage(
        'Connectez-vous dans Async Herald Desktop pour analyser ce projet.',
        'Ouvrir Async Herald'
      );
      if (choice) {
        await vscode.commands.executeCommand('async-herald.openInDesktop');
      }
      return;
    }
    case 'quota': {
      const choice = await vscode.window.showWarningMessage(error, 'Voir les offres');
      if (choice) {
        await vscode.env.openExternal(vscode.Uri.parse(`${HERALD_CONFIG.WEB_URL}/plans`));
      }
      return;
    }
    default:
      vscode.window.showErrorMessage(`Herald : ${error}`);
  }
}

export function deactivate() {
  // Rien à libérer : l'analyse en cours s'arrête avec la fenêtre.
}
