// Async Herald Desktop sur cette machine : où le trouver, sa version, et
// comment lui faire analyser un dossier sans ouvrir sa fenêtre.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile, spawn } from 'child_process';
import { HERALD_CONFIG } from './config';
import {
  DesktopError,
  DesktopReport,
  compareVersions,
  parseDesktopOutput,
  parseProgressLine,
} from './report';

export interface DesktopInstall {
  /** Exécutable à lancer. */
  executable: string;
  /** Bundle `.app` sur macOS (pour l'ouvrir comme une app). */
  bundle?: string;
  /** Version lue dans le bundle (macOS) ; inconnue ailleurs. */
  version?: string;
}

/** Emplacements habituels de l'exécutable, par système. */
function candidates(): Array<{ executable: string; bundle?: string }> {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin': {
      return ['/Applications', path.join(home, 'Applications')].map(dir => {
        const bundle = path.join(dir, HERALD_CONFIG.MAC_APP_NAME);
        return { bundle, executable: path.join(bundle, 'Contents', 'MacOS', 'herald-desktop') };
      });
    }
    case 'win32': {
      const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
      const dirs = [
        path.join(local, 'Programs', 'Async Herald'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Async Herald'),
        process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)']!, 'Async Herald'),
      ].filter((d): d is string => !!d);
      return dirs.map(dir => ({ executable: path.join(dir, 'herald-desktop.exe') }));
    }
    default: {
      const fromPath = (process.env.PATH ?? '')
        .split(path.delimiter)
        .filter(Boolean)
        .map(dir => path.join(dir, 'herald-desktop'));
      return [
        '/usr/bin/herald-desktop',
        '/usr/local/bin/herald-desktop',
        path.join(home, '.local', 'bin', 'herald-desktop'),
        ...fromPath,
      ].map(executable => ({ executable }));
    }
  }
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Version de l'app lue dans Info.plist (macOS uniquement). */
function bundleVersion(bundle: string): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(
      '/usr/bin/plutil',
      ['-extract', 'CFBundleShortVersionString', 'raw', path.join(bundle, 'Contents', 'Info.plist')],
      { timeout: 3000 },
      (err, stdout) => resolve(err ? undefined : stdout.trim() || undefined)
    );
  });
}

/**
 * Cherche Async Herald Desktop : d'abord le chemin du réglage
 * `asyncHerald.desktopPath` (un `.app` ou l'exécutable), puis les emplacements
 * habituels.
 */
export async function findDesktop(): Promise<DesktopInstall | undefined> {
  const configured = vscode.workspace
    .getConfiguration('asyncHerald')
    .get<string>('desktopPath', '')
    .trim();
  const list = configured
    ? [
        configured.endsWith('.app')
          ? { bundle: configured, executable: path.join(configured, 'Contents', 'MacOS', 'herald-desktop') }
          : { executable: configured },
      ]
    : candidates();

  for (const item of list) {
    if (isExecutable(item.executable)) {
      const version = item.bundle ? await bundleVersion(item.bundle) : undefined;
      return { ...item, version };
    }
  }
  return undefined;
}

/** Vrai si la version installée sait analyser en ligne de commande. */
export function supportsCli(install: DesktopInstall): boolean {
  // Version inconnue (Windows, Linux) : on tente, l'app répond par une erreur
  // claire si elle est trop ancienne.
  return !install.version || compareVersions(install.version, HERALD_CONFIG.MIN_DESKTOP_VERSION) >= 0;
}

/**
 * Analyse `folder` avec l'app, sans fenêtre. La progression arrive par
 * `onProgress` ; l'annulation arrête l'app.
 */
export function analyzeWithDesktop(
  install: DesktopInstall,
  folder: string,
  onProgress: (percent: number, message: string) => void,
  token?: vscode.CancellationToken
): Promise<DesktopReport | DesktopError> {
  return new Promise(resolve => {
    const child = spawn(install.executable, ['--analyze', folder, '--json'], {
      env: { ...process.env, HERALD_HEADLESS: '1' },
      windowsHide: true,
    });

    let stdout = '';
    let stderrTail = '';
    let pending = '';
    let settled = false;
    let alive = false;
    const finish = (value: DesktopReport | DesktopError) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        clearTimeout(startup);
        cancel?.dispose();
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ error: 'L\'analyse a dépassé le temps maximal (10 min).', code: 'timeout' });
    }, HERALD_CONFIG.ANALYZE_TIMEOUT_MS);

    // Aucun signe (progression ou rapport) au démarrage : version sans `--analyze`.
    const startup = setTimeout(() => {
      if (!alive) {
        child.kill();
        finish({
          error: `Async Herald Desktop${install.version ? ' ' + install.version : ''} ne sait pas encore analyser depuis VS Code. Mettez l'app à jour.`,
          code: 'unsupported',
        });
      }
    }, HERALD_CONFIG.STARTUP_TIMEOUT_MS);

    const cancel = token?.onCancellationRequested(() => {
      child.kill();
      finish({ error: 'Analyse annulée.', code: 'cancelled' });
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      alive = true;
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseProgressLine(line);
        if (progress) {
          alive = true;
          onProgress(progress.percent, progress.message);
        } else if (line.trim()) {
          stderrTail = (stderrTail + '\n' + line).slice(-2000);
        }
      }
    });

    child.on('error', err => {
      finish({ error: `Impossible de lancer Async Herald Desktop : ${err.message}`, code: 'spawn' });
    });

    child.on('close', code => {
      if (stdout.trim()) {
        finish(parseDesktopOutput(stdout));
      } else {
        const detail = stderrTail.trim().split('\n').pop();
        finish({
          error:
            code === 0
              ? 'Async Herald Desktop n\'a rien renvoyé. Mettez l\'app à jour.'
              : `Async Herald Desktop s'est arrêté (code ${code})${detail ? ` : ${detail}` : ''}.`,
          code: 'no_output',
        });
      }
    });
  });
}

/** Ouvre l'app (avec sa fenêtre) sur le dossier donné. */
export function openDesktop(install: DesktopInstall, folder?: string): void {
  if (install.bundle && process.platform === 'darwin') {
    const args = ['-a', install.bundle];
    if (folder) {
      args.push('--args', '--open', folder);
    }
    spawn('/usr/bin/open', args, { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn(install.executable, folder ? ['--open', folder] : [], { detached: true, stdio: 'ignore' }).unref();
}
