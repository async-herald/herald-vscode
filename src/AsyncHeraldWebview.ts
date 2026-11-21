import * as vscode from 'vscode';
import { HERALD_CONFIG } from './config';
import { DesktopReport, DesktopIssue, CATEGORY_LABELS, categoryLabel } from './report';

/** État d'Async Herald Desktop sur cette machine. */
export interface DesktopStatus {
  state: 'missing' | 'outdated' | 'ready';
  version?: string;
  path?: string;
}

export class AsyncHeraldWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  private desktop: DesktopStatus = { state: 'missing' };
  private isAnalyzing: boolean = false;
  private hasConfigFile: boolean = false;
  private configData?: { ignore?: string[]; rules?: { disable?: string[] } };
  private report?: DesktopReport;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Vérifier si le fichier de config existe
    this.checkConfigFile();

    // Watcher pour détecter la création/suppression du fichier config
    if (vscode.workspace.workspaceFolders) {
      const pattern = new vscode.RelativePattern(
        vscode.workspace.workspaceFolders[0],
        'herald.config.json'
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate(() => this.checkConfigFile());
      watcher.onDidDelete(() => this.checkConfigFile());
      watcher.onDidChange(() => this.checkConfigFile());
    }

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'analyze':
          await vscode.commands.executeCommand('async-herald.analyze');
          break;
        case 'openInDesktop':
          await vscode.commands.executeCommand('async-herald.openInDesktop');
          break;
        case 'downloadDesktop':
          await vscode.commands.executeCommand('async-herald.downloadDesktop');
          break;
        case 'openFile':
          if (data.file && vscode.workspace.workspaceFolders) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, data.file);
            try {
              const document = await vscode.workspace.openTextDocument(filePath);
              const line = data.line ? data.line - 1 : 0; // VSCode uses 0-based line numbers
              const column = data.column ? data.column - 1 : 0;
              await vscode.window.showTextDocument(document, {
                selection: new vscode.Range(line, column, line, column)
              });
            } catch (error) {
              vscode.window.showErrorMessage(`Impossible d'ouvrir le fichier: ${data.file}`);
            }
          }
          break;
        case 'createConfig':
          if (vscode.workspace.workspaceFolders) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'herald.config.json');
            const configContent = {
              ignore: [
                "docs",
                "src/generated",
                "**/*.min.js"
              ],
              rules: {
                disable: []
              },
              thresholds: {
                maxFileLines: 500
              }
            };
            try {
              await vscode.workspace.fs.writeFile(
                configPath,
                Buffer.from(JSON.stringify(configContent, null, 2), 'utf8')
              );
              const document = await vscode.workspace.openTextDocument(configPath);
              await vscode.window.showTextDocument(document);
              vscode.window.showInformationMessage('Fichier herald.config.json créé avec succès !');
              await this.checkConfigFile();
            } catch (error) {
              vscode.window.showErrorMessage(`Erreur lors de la création du fichier: ${error}`);
            }
          }
          break;
        case 'saveConfig':
          if (vscode.workspace.workspaceFolders && data.config) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'herald.config.json');
            try {
              await vscode.workspace.fs.writeFile(
                configPath,
                Buffer.from(JSON.stringify(data.config, null, 2), 'utf8')
              );
              vscode.window.showInformationMessage('Configuration sauvegardée avec succès !');
            } catch (error) {
              vscode.window.showErrorMessage(`Erreur lors de la sauvegarde: ${error}`);
            }
          }
          break;
        case 'openConfig':
          if (vscode.workspace.workspaceFolders) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'herald.config.json');
            try {
              const document = await vscode.workspace.openTextDocument(configPath);
              await vscode.window.showTextDocument(document);
            } catch (error) {
              vscode.window.showErrorMessage(`Impossible d'ouvrir le fichier: ${error}`);
            }
          }
          break;
        case 'openRulesList':
          await vscode.env.openExternal(vscode.Uri.parse(`${HERALD_CONFIG.WEB_URL}/criteria`));
          break;
      }
    });
  }

  public setDesktopStatus(status: DesktopStatus) {
    this.desktop = status;
    this.refresh();
  }

  public setAnalyzing(analyzing: boolean) {
    this.isAnalyzing = analyzing;
    this.refresh();
  }

  /** Progression envoyée par l'app pendant l'analyse (sans redessiner le panneau). */
  public setProgress(percent: number, message: string) {
    this._view?.webview.postMessage({ type: 'progress', percent, message });
  }

  public setReport(report: DesktopReport | undefined) {
    this.isAnalyzing = false;
    this.report = report;
    this.refresh();
  }

  public async checkConfigFile() {
    if (vscode.workspace.workspaceFolders) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'herald.config.json');
      try {
        const configContent = await vscode.workspace.fs.readFile(configPath);
        const configText = Buffer.from(configContent).toString('utf8');
        this.configData = JSON.parse(configText);
        this.hasConfigFile = true;
      } catch {
        this.hasConfigFile = false;
        this.configData = undefined;
      }
      this.refresh();
    }
  }

  private refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  private formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {
      return 'À l\'instant';
    } else if (minutes < 60) {
      return `Il y a ${minutes} min`;
    } else if (hours < 24) {
      return `Il y a ${hours}h`;
    } else {
      return `Il y a ${days}j`;
    }
  }

  private getScoreColor(score: number): string {
    if (score >= 80) {
      return '#73C991';
    } else if (score >= 60) {
      return '#CCA700';
    } else {
      return '#F48771';
    }
  }

  private getCategoryColor(key: string): string {
    const colors: { [key: string]: string } = {
      security: '#EF4444',
      quality: '#3B82F6',
      git: '#8B5CF6',
      devops: '#06B6D4',
      pattern: '#F59E0B',
      dependencies: '#10B981',
      tests: '#EC4899'
    };
    return colors[key] || '#6B7280';
  }

  private escape(text: string | undefined): string {
    return (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Héraut céleste doré (identique à HeraldCelestial de l'app web) affiché
  // pendant l'analyse, sur fond doré. Animé via les keyframes ha-* du CSS.
  private getCelestialSVG(): string {
    return `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hg-celestial" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF" />
            <stop offset="100%" stop-color="#FBF3DA" />
          </linearGradient>
          <linearGradient id="hg-celestial-deep" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFDF6" />
            <stop offset="100%" stop-color="#F0E5C0" />
          </linearGradient>
          <radialGradient id="hg-celestial-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stop-color="#FBE8B8" stop-opacity="0.7" />
            <stop offset="60%" stop-color="#FBE8B8" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#FBE8B8" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="34" fill="url(#hg-celestial-glow)" />
        <circle cx="50" cy="50" r="18" fill="#F3E9CC" opacity="0.55" />
        <g class="ha-wing ha-wing-tl">
          <path d="M42 44 Q 26 30, 8 16 Q 12 28, 24 38 Q 16 34, 8 28 Q 18 40, 40 46 Z" fill="url(#hg-celestial)" stroke="#C8A96A" stroke-width="0.9" />
          <path d="M38 42 Q 28 34, 18 26 M 34 40 Q 24 32, 14 24" stroke="#C8A96A" stroke-width="0.45" opacity="0.5" fill="none" />
        </g>
        <g class="ha-wing ha-wing-tr">
          <path d="M58 44 Q 74 30, 92 16 Q 88 28, 76 38 Q 84 34, 92 28 Q 82 40, 60 46 Z" fill="url(#hg-celestial)" stroke="#C8A96A" stroke-width="0.9" />
          <path d="M62 42 Q 72 34, 82 26 M 66 40 Q 76 32, 86 24" stroke="#C8A96A" stroke-width="0.45" opacity="0.5" fill="none" />
        </g>
        <g class="ha-wing ha-wing-bl">
          <path d="M42 56 Q 26 70, 8 84 Q 12 72, 24 62 Q 16 66, 8 72 Q 18 60, 40 54 Z" fill="url(#hg-celestial-deep)" stroke="#C8A96A" stroke-width="0.9" />
          <path d="M38 58 Q 28 66, 18 74 M 34 60 Q 24 68, 14 76" stroke="#C8A96A" stroke-width="0.45" opacity="0.5" fill="none" />
        </g>
        <g class="ha-wing ha-wing-br">
          <path d="M58 56 Q 74 70, 92 84 Q 88 72, 76 62 Q 84 66, 92 72 Q 82 60, 60 54 Z" fill="url(#hg-celestial-deep)" stroke="#C8A96A" stroke-width="0.9" />
          <path d="M62 58 Q 72 66, 82 74 M 66 60 Q 76 68, 86 76" stroke="#C8A96A" stroke-width="0.45" opacity="0.5" fill="none" />
        </g>
        <g class="ha-deco">
          <ellipse cx="50" cy="22" rx="12" ry="4" fill="none" stroke="#C8A96A" stroke-width="1.8" />
          <ellipse cx="50" cy="22" rx="8" ry="2.4" fill="none" stroke="#E8D8A8" stroke-width="0.9" opacity="0.85" />
          <circle cx="50" cy="22" r="1.4" fill="#C8A96A" />
        </g>
        <circle cx="50" cy="50" r="14" fill="#FFFFFF" stroke="#B89D56" stroke-width="1.8" />
        <g class="ha-eye">
          <g class="ha-pupil">
            <circle cx="50" cy="50" r="9" fill="#E8D8A8" />
            <circle cx="50" cy="50" r="4" fill="#2A2A36" />
            <circle cx="53" cy="47" r="2" fill="#FFFFFF" />
            <circle cx="47" cy="52" r="0.8" fill="#FFFFFF" opacity="0.6" />
          </g>
        </g>
      </svg>
    `;
  }

  /** Problèmes regroupés par règle : une entrée par règle, avec ses emplacements. */
  private groupByRule(issues: DesktopIssue[]) {
    const grouped = new Map<string, {
      issue: DesktopIssue;
      locations: Array<{ file: string; line?: number }>;
    }>();
    for (const issue of issues) {
      const group = grouped.get(issue.rule);
      const location = issue.file && !issue.file.startsWith('(') ? { file: issue.file, line: issue.line } : undefined;
      if (group) {
        if (location) {
          group.locations.push(location);
        }
      } else {
        grouped.set(issue.rule, { issue, locations: location ? [location] : [] });
      }
    }
    const order = { critical: 0, warning: 1, info: 2 };
    return Array.from(grouped.values()).sort(
      (x, y) => order[x.issue.severity] - order[y.issue.severity] || y.locations.length - x.locations.length
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }

    .container {
      padding: 8px;
    }

    .section {
      margin-bottom: 8px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: var(--vscode-sideBar-background);
      border-radius: 3px;
      margin-bottom: 8px;
    }

    .user-email {
      flex: 1;
      font-weight: 500;
    }

    .disconnect-icon {
      width: 20px;
      height: 20px;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      color: var(--vscode-descriptionForeground);
      transition: all 0.2s;
    }

    .disconnect-icon:hover {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
    }

    .tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .tab {
      padding: 6px 12px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      font-size: 12px;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
    }

    .tab:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
    }

    .tab.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-button-background);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .button {
      width: 100%;
      padding: 6px 10px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background-color 0.2s;
      margin-bottom: 8px;
    }

    .button:hover {
      opacity: 0.9;
    }

    .button-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .button-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .button-danger {
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
    }

    .button-danger:hover {
      background: var(--vscode-inputValidation-errorBackground);
    }

    .limit-reached {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px;
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 3px;
      margin-bottom: 6px;
      text-align: center;
      font-size: 11px;
      color: var(--vscode-foreground);
    }

    .limit-reset {
      opacity: 0.7;
      font-size: 10px;
    }

    .icon {
      width: 16px;
      height: 16px;
    }

    .results {
      background: var(--vscode-sideBar-background);
      border-radius: 3px;
      padding: 8px;
      margin-bottom: 6px;
    }

    .result-header {
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .result-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .result-item:last-child {
      border-bottom: none;
    }

    .result-label {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }

    .result-value {
      font-weight: 600;
      font-size: 11px;
    }

    .score-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 11px;
    }

    .grade {
      margin-left: 4px;
      font-size: 10px;
      opacity: 0.8;
    }

    .divider {
      height: 1px;
      background: var(--vscode-widget-border);
      margin: 8px 0;
    }

    .loading-container {
      position: relative;
      background: linear-gradient(160deg, #FEF3C7 0%, #FDE8B0 55%, #F8D77E 100%);
      border: 1px solid #F0C860;
      border-radius: 10px;
      padding: 22px 16px 18px;
      margin-bottom: 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
    }

    /* Halo lumineux derrière le héraut */
    .loading-container::before {
      content: '';
      position: absolute;
      top: 4px;
      left: 50%;
      width: 140px;
      height: 140px;
      transform: translateX(-50%);
      background: radial-gradient(circle, rgba(251, 232, 184, 0.95) 0%, rgba(251, 232, 184, 0) 70%);
      pointer-events: none;
    }

    .herald-celestial {
      position: relative;
      width: 84px;
      height: 84px;
      display: inline-block;
      animation: ha-float 3s ease-in-out infinite;
      will-change: transform;
    }
    .herald-celestial svg { width: 100%; height: 100%; display: block; overflow: visible; }

    .herald-celestial .ha-wing,
    .herald-celestial .ha-deco,
    .herald-celestial .ha-eye,
    .herald-celestial .ha-pupil { transform-box: view-box; }

    .herald-celestial .ha-wing-tl { transform-origin: 42px 44px; animation: ha-wing-tl 1.2s ease-in-out infinite alternate; }
    .herald-celestial .ha-wing-tr { transform-origin: 58px 44px; animation: ha-wing-tr 1.2s ease-in-out infinite alternate; }
    .herald-celestial .ha-wing-bl { transform-origin: 42px 56px; animation: ha-wing-bl 1.2s ease-in-out infinite alternate; animation-delay: 0.05s; }
    .herald-celestial .ha-wing-br { transform-origin: 58px 56px; animation: ha-wing-br 1.2s ease-in-out infinite alternate; animation-delay: 0.05s; }
    .herald-celestial .ha-deco { transform-origin: 50px 24px; animation: ha-deco-pulse 3.6s ease-in-out infinite; }
    .herald-celestial .ha-eye { transform-origin: 50px 50px; animation: ha-eye-blink 9s steps(1, end) infinite; }
    .herald-celestial .ha-pupil { transform-origin: 50px 50px; animation: ha-pupil-move 5.4s ease-in-out infinite; }

    @keyframes ha-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes ha-wing-tl { from { transform: rotate(0deg); } to { transform: rotate(-15deg); } }
    @keyframes ha-wing-tr { from { transform: rotate(0deg); } to { transform: rotate(15deg); } }
    @keyframes ha-wing-bl { from { transform: rotate(0deg); } to { transform: rotate(15deg); } }
    @keyframes ha-wing-br { from { transform: rotate(0deg); } to { transform: rotate(-15deg); } }
    @keyframes ha-deco-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
    @keyframes ha-eye-blink { 0%, 96% { opacity: 1; } 97%, 98% { opacity: 0.1; } 99%, 100% { opacity: 1; } }
    @keyframes ha-pupil-move {
      0%, 20% { transform: translateX(0); }
      35%, 50% { transform: translateX(2px); }
      62%, 80% { transform: translateX(-2px); }
      92%, 100% { transform: translateX(0); }
    }

    .loading-text {
      font-size: 12px;
      color: #8A6A1E;
      margin-top: 12px;
      margin-bottom: 4px;
    }

    .herald-name {
      font-weight: 700;
      color: #92600C;
    }

    .progress-bar {
      width: 100%;
      height: 5px;
      background: rgba(146, 96, 12, 0.16);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 12px;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: 3px;
      background: linear-gradient(90deg, #F0C860, #C8A96A);
      transition: width 0.1s linear;
    }

    .timer {
      margin-top: 6px;
      font-size: 10px;
      color: #9A7B34;
      font-variant-numeric: tabular-nums;
    }

    @media (prefers-reduced-motion: reduce) {
      .herald-celestial,
      .herald-celestial .ha-wing-tl, .herald-celestial .ha-wing-tr,
      .herald-celestial .ha-wing-bl, .herald-celestial .ha-wing-br,
      .herald-celestial .ha-deco, .herald-celestial .ha-eye, .herald-celestial .ha-pupil {
        animation: none;
      }
    }

    .disabled {
      opacity: 0.5;
      cursor: not-allowed !important;
      pointer-events: none;
    }

    .category-item {
      margin-bottom: 4px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 3px;
      overflow: hidden;
    }

    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 6px;
      cursor: pointer;
      background: var(--vscode-sideBar-background);
      transition: background 0.2s;
    }

    .category-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .category-header-left {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }

    .category-expand-icon {
      width: 10px;
      height: 10px;
      transition: transform 0.2s;
    }

    .category-expand-icon.expanded {
      transform: rotate(90deg);
    }

    .category-name {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
    }

    .category-header-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .category-issue-count {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      padding: 1px 4px;
      border-radius: 6px;
    }

    .category-score {
      font-size: 13px;
      font-weight: 700;
    }

    .category-bar {
      width: 100%;
      height: 3px;
      background: var(--vscode-widget-border);
    }

    .category-bar-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .category-issues {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      background: var(--vscode-editor-background);
    }

    .category-issues.expanded {
      max-height: 2000px;
    }

    .issue-item {
      padding: 6px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .issue-header {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-bottom: 2px;
    }

    .severity-badge {
      padding: 1px 3px;
      border-radius: 2px;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .severity-critical {
      background: #F48771;
      color: white;
    }

    .severity-warning {
      background: #CCA700;
      color: white;
    }

    .severity-info {
      background: #75BEFF;
      color: white;
    }

    .issue-title {
      flex: 1;
      font-size: 10px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    .issue-message {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
      line-height: 1.3;
    }

    .issue-locations {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 3px;
    }

    .issue-location {
      font-size: 8px;
      color: var(--vscode-descriptionForeground);
      font-family: monospace;
      padding: 2px 4px;
      border-radius: 2px;
      width: fit-content;
    }

    .issue-location.clickable {
      cursor: pointer;
      transition: background 0.2s;
    }

    .issue-location.clickable:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-textLink-activeForeground);
    }

    .no-issues {
      padding: 6px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      font-style: italic;
    }

    .config-section {
      margin-bottom: 8px;
    }

    .config-description {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .config-code {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 3px;
      padding: 8px;
      font-family: monospace;
      font-size: 9px;
      white-space: pre-wrap;
      margin-bottom: 8px;
      color: var(--vscode-editor-foreground);
    }

    .config-options {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .config-option {
      margin-bottom: 6px;
    }

    .config-option-name {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .no-config {
      padding: 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      margin-bottom: 8px;
    }

    .config-form {
      margin-bottom: 8px;
    }

    .form-group {
      margin-bottom: 8px;
    }

    .form-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--vscode-foreground);
      display: block;
      margin-bottom: 4px;
    }

    .form-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .form-label-row .form-label {
      margin-bottom: 0;
    }

    .button-link {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      font-size: 10px;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }

    .button-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }

    .form-input {
      width: 100%;
      padding: 4px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-size: 10px;
      font-family: monospace;
    }

    .form-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .form-textarea {
      width: 100%;
      min-height: 80px;
      padding: 4px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-size: 9px;
      font-family: monospace;
      resize: vertical;
    }

    .form-textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .form-help {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .form-help-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .button-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .button-small {
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Async Herald Desktop -->
    <div class="user-info">
      <img class="icon" src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'aile.svg'))}" alt="">
      <span class="user-email">Async Herald Desktop${this.desktop.version ? ' ' + this.escape(this.desktop.version) : ''} · analyse locale</span>
      <button class="button-link" onclick="openInDesktop()" title="Ouvrir Async Herald">Ouvrir l'app</button>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <div class="tab active" onclick="switchTab('analysis')">Analyse</div>
      <div class="tab" onclick="switchTab('config')">Config</div>
    </div>

    <!-- Tab Content: Analysis -->
    <div class="tab-content active" id="tab-analysis">
      <button class="button button-secondary ${this.isAnalyzing ? 'disabled' : ''}" onclick="analyze()" ${this.isAnalyzing ? 'disabled' : ''}>
        <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l6.25 11H1.75L8 1z"/>
        </svg>
        ${this.isAnalyzing ? 'Analyse en cours...' : (this.report ? 'Nouvelle analyse' : 'Analyser le projet')}
      </button>

    ${this.report && !this.isAnalyzing ? `
    <!-- Results -->
    <div class="results">
      <div class="result-header">Résultats de l'analyse</div>

      <div class="result-item">
        <span class="result-label">Score global</span>
        <span class="result-value">
          <span class="score-badge" style="background: ${this.getScoreColor(this.report.score)}; color: white;">
            ${this.report.score}/100
          </span>
          <span class="grade">${this.escape(this.report.grade)}</span>
        </span>
      </div>

      ${this.report.previousScore !== undefined ? `
      <div class="result-item">
        <span class="result-label">Analyse précédente</span>
        <span class="result-value">${this.report.previousScore}/100 (${this.report.score - this.report.previousScore >= 0 ? '+' : ''}${this.report.score - this.report.previousScore})</span>
      </div>
      ` : ''}

      <div class="result-item">
        <span class="result-label">Fichiers analysés</span>
        <span class="result-value">${this.report.files.toLocaleString('fr-FR')}</span>
      </div>

      <div class="result-item">
        <span class="result-label">Durée</span>
        <span class="result-value">${(this.report.durationMs / 1000).toFixed(1).replace('.', ',')} s · aucun fichier envoyé</span>
      </div>
    </div>

    <!-- Catégories -->
    <div class="results">
      <div class="result-header">Catégories</div>

      ${(() => {
        const report = this.report!;
        const ids = Object.keys(CATEGORY_LABELS);
        report.categories.forEach(c => { if (!ids.includes(c.id)) { ids.push(c.id); } });
        const groups = new Map(ids.map(id => [id, this.groupByRule(report.issues.filter(i => i.category === id))]));
        const maxRules = Math.max(...Array.from(groups.values()).map(g => g.length), 1);
        return ids
          .map(id => ({ id, category: report.categories.find(c => c.id === id), rules: groups.get(id) ?? [] }))
          .sort((x, y) => y.rules.length - x.rules.length)
          .map(({ id, category, rules }) => {
          const issueCount = report.issues.filter(i => i.category === id).length;
          const applicable = category?.applicable ?? false;
          return `
            <div class="category-item">
              <div class="category-header" onclick="toggleCategory('${id}')">
                <div class="category-header-left">
                  <svg class="category-expand-icon" id="expand-${id}" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 4l4 4-4 4V4z"/>
                  </svg>
                  <span class="category-name">${this.escape(category?.label ?? categoryLabel(id))}</span>
                  <span style="margin-left: 8px; font-size: 11px; color: #888;">${applicable && category ? `${this.escape(category.grade)} · ${category.score}/100` : 'rien à examiner'}</span>
                </div>
                <div class="category-header-right">
                  <span class="category-issue-count">${issueCount} problème${issueCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div class="category-bar">
                <div class="category-bar-fill" style="width: ${(rules.length / maxRules) * 100}%; background: ${this.getCategoryColor(id)}"></div>
              </div>
              <div class="category-issues" id="issues-${id}">
                ${rules.length > 0 ? rules.map(group => `
                  <div class="issue-item">
                    <div class="issue-header">
                      <span class="severity-badge severity-${group.issue.severity}">${group.issue.severity}</span>
                      <span class="issue-title">${this.escape(group.issue.title)}</span>
                    </div>
                    ${group.issue.explanation ? `<div class="issue-message">${this.escape(group.issue.explanation)}</div>` : ''}
                    ${group.issue.fix ? `<div class="issue-message"><strong>Correction :</strong> ${this.escape(group.issue.fix)}</div>` : ''}
                    ${group.locations.length > 0 ? `
                      <div class="issue-locations">
                        ${group.locations.map(loc => `
                          <div class="issue-location clickable" onclick="openFile('${this.escape(loc.file).replace(/'/g, "\\'")}', ${loc.line || 0}, 0)">
                            ${this.escape(loc.file)}${loc.line ? ':' + loc.line : ''}
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('') : '<div class="no-issues">Aucun problème détecté</div>'}
              </div>
            </div>
          `;
        }).join('');
      })()}
    </div>

    <button class="button button-primary" onclick="openInDesktop()">
      <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9 2L7 2 7 7 2 7 2 9 7 9 7 14 9 14 9 9 14 9 14 7 9 7z"/>
      </svg>
      Voir dans Async Herald
    </button>
    ` : ''}

      ${this.isAnalyzing ? `
      <!-- Loading State : héraut céleste, progression envoyée par l'app -->
      <div class="loading-container">
        <div class="herald-celestial">${this.getCelestialSVG()}</div>
        <p class="loading-text">
          <span class="herald-name" id="herald-name">Herald</span>
          <span id="herald-description">prépare l'analyse locale…</span>
        </p>
        <div class="progress-bar">
          <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
        </div>
        <div class="timer">
          <span id="elapsed-time">0,0 s</span>
        </div>
      </div>
      <script>
        (function() {
          const startTime = Date.now();
          const timeEl = document.getElementById('elapsed-time');
          const timer = setInterval(function() {
            if (timeEl) timeEl.textContent = ((Date.now() - startTime) / 1000).toFixed(1).replace('.', ',') + ' s';
          }, 100);
          window.stopHeraldAnimation = function() { clearInterval(timer); };
        })();
      </script>
      ` : ''}
    </div>

    <!-- Tab Content: Config -->
    <div class="tab-content" id="tab-config">
      <div class="results">
        <div class="result-header">Configuration Herald</div>

        ${!this.hasConfigFile ? `
        <div class="config-section">
          <div class="no-config">
            Créez un fichier herald.config.json pour personnaliser l'analyse
          </div>

          <button class="button button-primary" onclick="createConfig()">
            <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9 2L7 2 7 7 2 7 2 9 7 9 7 14 9 14 9 9 14 9 14 7 9 7z"/>
            </svg>
            Créer herald.config.json
          </button>

          <div class="config-description">
            Exemple de configuration :
          </div>

          <div class="config-code">{
  "ignore": [
    "docs",
    "src/generated",
    "**/*.min.js"
  ],
  "rules": {
    "disable": ["eval-usage"]
  },
  "thresholds": {
    "maxFileLines": 500
  }
}</div>

          <div class="result-header" style="margin-top: 8px;">Options disponibles</div>

          <div class="config-options">
            <div class="config-option">
              <span class="config-option-name">ignore</span> (string[])<br>
              Fichiers et dossiers à exclure. Patterns glob supportés.
            </div>

            <div class="config-option">
              <span class="config-option-name">rules.disable</span> (string[])<br>
              Liste des ID de règles à désactiver.
            </div>

            <div class="config-option">
              <span class="config-option-name">thresholds.maxFileLines</span> (number)<br>
              Nombre max de lignes par fichier. Défaut : 300.
            </div>
          </div>
        </div>
        ` : `
        <div class="config-section">
          <div class="config-description">
            Configurez les paramètres d'analyse de Herald
          </div>

          <div class="config-form">
            <div class="form-group">
              <label class="form-label">Fichiers à ignorer (un par ligne)</label>
              <textarea class="form-textarea" id="config-ignore" placeholder="docs&#10;src/generated&#10;**/*.min.js">${this.configData?.ignore?.join('\n') || 'docs\nsrc/generated\n**/*.min.js'}</textarea>
              <div class="form-help">Patterns glob supportés : *, **, *.ext</div>
            </div>

            <div class="form-group">
              <label class="form-label">Règles désactivées (IDs séparés par des virgules)</label>
              <input type="text" class="form-input" id="config-disabled-rules" placeholder="eval-usage, no-console" value="${this.configData?.rules?.disable?.join(', ') || ''}">
              <div class="form-help-row">
                <span>IDs des règles à désactiver</span>
                <button class="button-link" onclick="openRulesList()">Voir les règles</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Lignes max par fichier</label>
              <input type="number" class="form-input" id="config-max-lines" value="${(this.configData as any)?.thresholds?.maxFileLines || 500}" min="100" max="10000">
              <div class="form-help">Défaut : 300 lignes</div>
            </div>

            <div class="button-group">
              <button class="button button-primary button-small" onclick="saveConfig()">
                <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
                Sauvegarder
              </button>
              <button class="button button-secondary button-small" onclick="openConfig()">
                <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9 2L7 2 7 7 2 7 2 9 7 9 7 14 9 14 9 9 14 9 14 7 9 7z"/>
                </svg>
                Éditer JSON
              </button>
            </div>
          </div>
        </div>
        `}
      </div>
    </div>

  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function analyze() {
      vscode.postMessage({ type: 'analyze' });
    }

    function openInDesktop() {
      vscode.postMessage({ type: 'openInDesktop' });
    }

    // Progression envoyée par Async Herald Desktop pendant l'analyse.
    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data && data.type === 'progress') {
        const fill = document.getElementById('progress-fill');
        const name = document.getElementById('herald-name');
        const desc = document.getElementById('herald-description');
        if (fill) fill.style.width = data.percent + '%';
        if (name) name.textContent = data.percent + ' %';
        if (desc && data.message) desc.textContent = data.message;
      }
    });

    function toggleCategory(categoryKey) {
      const issuesDiv = document.getElementById('issues-' + categoryKey);
      const expandIcon = document.getElementById('expand-' + categoryKey);

      if (issuesDiv && expandIcon) {
        issuesDiv.classList.toggle('expanded');
        expandIcon.classList.toggle('expanded');
      }
    }

    function openFile(file, line, column) {
      vscode.postMessage({
        type: 'openFile',
        file: file,
        line: line,
        column: column
      });
    }

    function switchTab(tabName) {
      // Remove active class from all tabs and tab-contents
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      // Add active class to selected tab
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(tab => {
        if (tab.getAttribute('onclick').includes(tabName)) {
          tab.classList.add('active');
        }
      });

      // Add active class to corresponding tab content
      const tabContent = document.getElementById('tab-' + tabName);
      if (tabContent) {
        tabContent.classList.add('active');
      }
    }

    function createConfig() {
      vscode.postMessage({ type: 'createConfig' });
    }

    function saveConfig() {
      const ignoreText = document.getElementById('config-ignore').value;
      const disabledRulesText = document.getElementById('config-disabled-rules').value;
      const maxLines = parseInt(document.getElementById('config-max-lines').value);

      const ignore = ignoreText.split('\\n').map(line => line.trim()).filter(line => line.length > 0);
      const disabledRules = disabledRulesText.split(',').map(rule => rule.trim()).filter(rule => rule.length > 0);

      const config = {
        ignore: ignore,
        rules: {
          disable: disabledRules
        },
        thresholds: {
          maxFileLines: maxLines
        }
      };

      vscode.postMessage({ type: 'saveConfig', config: config });
    }

    function openConfig() {
      vscode.postMessage({ type: 'openConfig' });
    }

    function openRulesList() {
      vscode.postMessage({ type: 'openRulesList' });
    }

  </script>
</body>
</html>`;
  }
}
