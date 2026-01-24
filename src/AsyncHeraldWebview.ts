import * as vscode from 'vscode';
import { HeraldAuthService } from './auth.service';
import { UsageResponse, Issue } from './herald.service';

export class AsyncHeraldWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private authService: HeraldAuthService;

  private userEmail?: string;
  private isAnalyzing: boolean = false;
  private hasConfigFile: boolean = false;
  private usageData?: UsageResponse;
  private lastAnalysis?: {
    score: number;
    grade: string;
    issuesCount: number;
    totalLines: number;
    categories: {
      structure: number;
      security: number;
      ai_patterns: number;
      performance: number;
      quality: number;
      documentation: number;
    };
    issues: Issue[];
    timestamp: Date;
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    authService: HeraldAuthService
  ) {
    this.authService = authService;
  }

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
        case 'disconnect':
          await vscode.commands.executeCommand('async-herald.disconnect');
          break;
        case 'analyze':
          await vscode.commands.executeCommand('async-herald.analyze');
          break;
        case 'openReport':
          await vscode.commands.executeCommand('async-herald.openReport');
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
        case 'openProPage':
          await vscode.env.openExternal(vscode.Uri.parse('https://app.itsasync.fr/pro'));
          break;
        case 'openRulesList':
          await vscode.env.openExternal(vscode.Uri.parse('https://app.itsasync.fr/herald#criteres'));
          break;
      }
    });
  }

  public setUserEmail(email?: string) {
    this.userEmail = email;
    this.refresh();
  }

  public setAnalyzing(analyzing: boolean) {
    this.isAnalyzing = analyzing;
    this.refresh();
  }

  public setAnalysisResult(
    score: number,
    grade: string,
    issuesCount: number,
    totalLines: number,
    categories: {
      structure: number;
      security: number;
      ai_patterns: number;
      performance: number;
      quality: number;
      documentation: number;
    },
    issues: Issue[]
  ) {
    this.isAnalyzing = false;
    const timestamp = new Date();
    this.lastAnalysis = {
      score,
      grade,
      issuesCount,
      totalLines,
      categories,
      issues,
      timestamp
    };

    this.refresh();
  }

  public clearAnalysisResult() {
    this.lastAnalysis = undefined;
    this.refresh();
  }

  public setUsageData(usage: UsageResponse) {
    this.usageData = usage;
    this.refresh();
  }

  public async checkConfigFile() {
    if (vscode.workspace.workspaceFolders) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'herald.config.json');
      try {
        await vscode.workspace.fs.stat(configPath);
        this.hasConfigFile = true;
      } catch {
        this.hasConfigFile = false;
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

  private getCategoryLabel(key: string): string {
    const labels: { [key: string]: string } = {
      structure: 'Structure de code',
      security: 'Faille de sécurité',
      ai_patterns: 'Patterns IA Toxique',
      performance: 'Performance',
      quality: 'Qualité',
      documentation: 'Documentation & Tests'
    };
    return labels[key] || key;
  }

  private mapCategoryToDisplayCategory(apiCategory: string): string {
    const mapping: { [key: string]: string } = {
      'architecture': 'structure',
      'security': 'security',
      'placeholders': 'ai_patterns',
      'deadcode': 'performance',
      'duplicates': 'performance',
      'quality': 'quality',
      'tests': 'documentation',
      'naming': 'quality',
      'style': 'quality',
      'commits': 'quality',
      'dependencies': 'security'
    };
    return mapping[apiCategory] || 'quality';
  }

  private groupIssuesByCategory(issues: Array<{
    id: string;
    category: string;
    severity: 'critical' | 'warning' | 'info';
    rule: string;
    title: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    code?: string;
    suggestion?: string;
  }>): { [key: string]: typeof issues } {
    const grouped: { [key: string]: typeof issues } = {
      structure: [],
      security: [],
      ai_patterns: [],
      performance: [],
      quality: [],
      documentation: []
    };

    issues.forEach(issue => {
      const displayCategory = this.mapCategoryToDisplayCategory(issue.category);
      grouped[displayCategory].push(issue);
    });

    return grouped;
  }

  private groupDuplicateIssues(issues: Array<{
    id: string;
    category: string;
    severity: 'critical' | 'warning' | 'info';
    rule: string;
    title: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    code?: string;
    suggestion?: string;
  }>) {
    const grouped = new Map<string, {
      issue: typeof issues[0];
      locations: Array<{ file: string; line?: number; column?: number }>;
    }>();

    issues.forEach(issue => {
      const key = `${issue.title}|||${issue.message}`;

      if (grouped.has(key)) {
        const group = grouped.get(key)!;
        if (issue.file) {
          group.locations.push({
            file: issue.file,
            line: issue.line,
            column: issue.column
          });
        }
      } else {
        grouped.set(key, {
          issue: issue,
          locations: issue.file ? [{
            file: issue.file,
            line: issue.line,
            column: issue.column
          }] : []
        });
      }
    });

    return Array.from(grouped.values());
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
      background: var(--vscode-sideBar-background);
      border-radius: 3px;
      padding: 16px;
      margin-bottom: 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .herald-icon {
      width: 80px;
      height: 80px;
      margin-bottom: 12px;
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .herald-icon svg path:nth-child(2),
    .herald-icon svg path:nth-child(3) {
      transform-origin: 42px 50px;
      animation: flapLeft 1.2s ease-in-out infinite;
    }

    .herald-icon svg path:nth-child(4),
    .herald-icon svg path:nth-child(5) {
      transform-origin: 58px 50px;
      animation: flapRight 1.2s ease-in-out infinite;
    }

    @keyframes flapLeft {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-15deg); }
    }

    @keyframes flapRight {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(15deg); }
    }

    .loading-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .herald-name {
      font-weight: 700;
      transition: color 0.3s ease;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: var(--vscode-widget-border);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.1s linear, background-color 0.3s ease;
    }

    .timer {
      margin-top: 6px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
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
    <!-- User Info -->
    <div class="user-info">
      <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
        <path d="M16 7.992C16 3.58 12.416 0 8 0S0 3.58 0 7.992c0 2.43 1.104 4.62 2.832 6.09.016.016.032.016.032.032.144.112.288.224.448.336.08.048.144.111.224.175A7.98 7.98 0 008.016 16a7.98 7.98 0 004.48-1.375c.08-.048.144-.111.224-.16.144-.111.304-.223.448-.335.016-.016.032-.016.032-.032 1.696-1.487 2.8-3.676 2.8-6.106zm-8 7.001c-1.504 0-2.88-.48-4.016-1.279.016-.128.048-.255.080-.383a4.17 4.17 0 01.416-.991c.176-.304.384-.576.64-.816.24-.24.528-.463.816-.639.304-.176.624-.304.976-.4A4.15 4.15 0 018 10.342a4.185 4.185 0 012.928 1.166c.368.368.656.8.864 1.295.112.288.192.592.24.911A7.03 7.03 0 018 14.993zm-2.448-7.4a2.49 2.49 0 01-.208-1.024c0-.351.064-.703.208-1.023.144-.32.336-.607.576-.847.24-.24.528-.431.848-.575.32-.144.672-.208 1.024-.208.368 0 .704.064 1.024.208.32.144.608.336.848.575.24.24.432.528.576.847.144.32.208.672.208 1.023 0 .368-.064.704-.208 1.023a2.84 2.84 0 01-.576.848 2.84 2.84 0 01-.848.575 2.715 2.715 0 01-2.064 0 2.84 2.84 0 01-.848-.575 2.526 2.526 0 01-.56-.848zm7.424 5.306c0-.032-.016-.048-.016-.08a5.22 5.22 0 00-.688-1.406 4.883 4.883 0 00-1.088-1.135 5.207 5.207 0 00-1.04-.608 2.82 2.82 0 00.464-.383 4.2 4.2 0 00.624-.784 3.624 3.624 0 00.528-1.934 3.71 3.71 0 00-.288-1.47 3.799 3.799 0 00-.816-1.199 3.845 3.845 0 00-1.2-.8 3.72 3.72 0 00-1.472-.287 3.72 3.72 0 00-1.472.288 3.631 3.631 0 00-1.2.815 3.84 3.84 0 00-.8 1.199 3.71 3.71 0 00-.288 1.47c0 .352.048.688.144 1.007.096.336.224.64.4.927.16.288.384.544.624.784.144.144.304.271.48.383a5.12 5.12 0 00-1.04.624c-.416.32-.784.703-1.088 1.119a4.999 4.999 0 00-.688 1.406c-.016.032-.016.064-.016.08C1.776 11.636.992 9.91.992 7.992.992 4.14 4.144.991 8 .991s7.008 3.149 7.008 7.001a6.96 6.96 0 01-2.032 4.907z"/>
      </svg>
      <span class="user-email">${this.userEmail || 'Connecté'}</span>
      <svg class="disconnect-icon" viewBox="0 0 16 16" fill="currentColor" onclick="disconnect()" title="Se déconnecter">
        <path d="M7 1L1 1v14h6v-2H3V3h4V1zm2 3l5 4-5 4V9H4V7h5V4z"/>
      </svg>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <div class="tab active" onclick="switchTab('analysis')">Analyse</div>
      <div class="tab" onclick="switchTab('usage')">Usage</div>
      <div class="tab" onclick="switchTab('config')">Config</div>
    </div>

    <!-- Tab Content: Analysis -->
    <div class="tab-content active" id="tab-analysis">
      ${this.isAnalyzing ? `
      <!-- Loading State -->
      <div class="loading-container">
        <div class="herald-icon" id="herald-icon"></div>
        <p class="loading-text">
          <span class="herald-name" id="herald-name">Seraph</span>
          <span id="herald-description">évalue la qualité globale du repository</span>
        </p>
        <div class="progress-bar">
          <div class="progress-bar-fill" id="progress-fill"></div>
        </div>
        <div class="timer">
          <span id="elapsed-time">0.0s</span>
        </div>
      </div>
      <script>
        (function() {
          const HERALD_STEPS = [
            { name: 'Seraph', description: 'évalue la qualité globale du repository', color: '#A78BFA' },
            { name: 'Uriel', description: 'traque les injections SQL, XSS, secrets exposés', color: '#EF4444' },
            { name: 'Auriel', description: 'examine l\\'architecture et l\\'organisation', color: '#8B5CF6' },
            { name: 'Barachiel', description: 'détecte les memory leaks et goulots', color: '#10B981' },
            { name: 'Zadkiel', description: 'inspecte la qualité globale du code', color: '#3B82F6' },
            { name: 'Raziel', description: 'vérifie la documentation et les tests', color: '#06B6D4' },
            { name: 'Cassiel', description: 'identifie le code IA non optimisé', color: '#F59E0B' },
          ];

          const HERALD_COLORS = {
            0: { primary: '#A78BFA', secondary: '#DDD6FE' },
            1: { primary: '#EF4444', secondary: '#FCA5A5' },
            2: { primary: '#8B5CF6', secondary: '#C4B5FD' },
            3: { primary: '#10B981', secondary: '#6EE7B7' },
            4: { primary: '#3B82F6', secondary: '#93C5FD' },
            5: { primary: '#06B6D4', secondary: '#67E8F9' },
            6: { primary: '#F59E0B', secondary: '#FCD34D' },
          };

          function getHeraldSVG(index) {
            const { primary, secondary } = HERALD_COLORS[index];
            return \`
              <svg viewBox="0 0 100 100" width="80" height="80">
                <circle cx="50" cy="50" r="45" fill="none" stroke="\${secondary}" stroke-width="1" opacity="0.3"/>
                <path d="M42 44 L28 30 L10 16 L12 26 L22 36 L18 34 L10 28 L16 40 L28 45 L40 46 Z"
                      fill="\${secondary}" stroke="\${primary}" stroke-width="0.8"/>
                <path d="M42 56 L28 70 L10 84 L12 74 L22 64 L18 66 L10 72 L16 60 L28 55 L40 54 Z"
                      fill="\${secondary}" stroke="\${primary}" stroke-width="0.8"/>
                <path d="M58 44 L72 30 L90 16 L88 26 L78 36 L82 34 L90 28 L84 40 L72 45 L60 46 Z"
                      fill="\${secondary}" stroke="\${primary}" stroke-width="0.8"/>
                <path d="M58 56 L72 70 L90 84 L88 74 L78 64 L82 66 L90 72 L84 60 L72 55 L60 54 Z"
                      fill="\${secondary}" stroke="\${primary}" stroke-width="0.8"/>
                <circle cx="50" cy="50" r="14" fill="#FFF" stroke="\${primary}" stroke-width="2"/>
                <circle cx="50" cy="50" r="9" fill="\${primary}"/>
                <circle cx="50" cy="50" r="4" fill="#1E1B4B"/>
                <circle cx="53" cy="47" r="2" fill="#FFF"/>
              </svg>
            \`;
          }

          let currentIndex = 0;
          const startTime = Date.now();

          function updateDisplay() {
            const step = HERALD_STEPS[currentIndex];
            document.getElementById('herald-name').textContent = step.name;
            document.getElementById('herald-name').style.color = step.color;
            document.getElementById('herald-description').textContent = step.description;
            document.getElementById('progress-fill').style.backgroundColor = step.color;
            document.getElementById('herald-icon').innerHTML = getHeraldSVG(currentIndex);
          }

          function updateProgress() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(100, (elapsed / 21000) * 100);
            document.getElementById('progress-fill').style.width = progress + '%';
            document.getElementById('elapsed-time').textContent = (elapsed / 1000).toFixed(1) + 's';
          }

          updateDisplay();

          const heraldInterval = setInterval(() => {
            currentIndex = (currentIndex + 1) % 7;
            updateDisplay();
          }, 3000);

          const timerInterval = setInterval(updateProgress, 100);

          window.stopHeraldAnimation = function() {
            clearInterval(heraldInterval);
            clearInterval(timerInterval);
          };
        })();
      </script>
      ` : ''}

    ${this.lastAnalysis ? `
    <!-- Results -->
    <div class="results">
      <div class="result-header">Résultats de l'analyse</div>

      <div class="result-item">
        <span class="result-label">Score global</span>
        <span class="result-value">
          <span class="score-badge" style="background: ${this.getScoreColor(this.lastAnalysis.score)}; color: white;">
            ${this.lastAnalysis.score}/100
          </span>
          <span class="grade">${this.lastAnalysis.grade}</span>
        </span>
      </div>

      <div class="result-item">
        <span class="result-label">Lignes de code</span>
        <span class="result-value">${this.lastAnalysis.totalLines.toLocaleString()}</span>
      </div>
    </div>

    <!-- Categories -->
    <div class="results">
      <div class="result-header">Catégories</div>

      ${(() => {
        const groupedIssues = this.groupIssuesByCategory(this.lastAnalysis.issues);
        const maxIssues = Math.max(...Object.keys(this.lastAnalysis.categories).map(key => (groupedIssues[key] || []).length), 1);
        return Object.entries(this.lastAnalysis.categories)
          .sort((a, b) => {
            const issuesA = (groupedIssues[a[0]] || []).length;
            const issuesB = (groupedIssues[b[0]] || []).length;
            return issuesB - issuesA; // Tri décroissant (plus de problèmes en premier)
          })
          .map(([key]) => {
          const categoryIssues = groupedIssues[key] || [];
          const issuePercent = (categoryIssues.length / maxIssues) * 100;
          const barColor = categoryIssues.length === 0 ? '#73C991' : (categoryIssues.length > maxIssues / 2 ? '#F48771' : '#CCA700');
          return `
            <div class="category-item">
              <div class="category-header" onclick="toggleCategory('${key}')">
                <div class="category-header-left">
                  <svg class="category-expand-icon" id="expand-${key}" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 4l4 4-4 4V4z"/>
                  </svg>
                  <span class="category-name">${this.getCategoryLabel(key)}</span>
                </div>
                <div class="category-header-right">
                  <span class="category-issue-count">${categoryIssues.length} problème${categoryIssues.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div class="category-bar">
                <div class="category-bar-fill" style="width: ${issuePercent}%; background: ${barColor}"></div>
              </div>
              <div class="category-issues" id="issues-${key}">
                ${categoryIssues.length > 0 ? this.groupDuplicateIssues(categoryIssues).map(group => `
                  <div class="issue-item">
                    <div class="issue-header">
                      <span class="severity-badge severity-${group.issue.severity}">${group.issue.severity}</span>
                      <span class="issue-title">${group.issue.title}</span>
                    </div>
                    <div class="issue-message">${group.issue.message}</div>
                    ${group.locations.length > 0 ? `
                      <div class="issue-locations">
                        ${group.locations.map(loc => `
                          <div class="issue-location clickable" onclick="openFile('${loc.file.replace(/'/g, "\\'")}', ${loc.line || 0}, ${loc.column || 0})">
                            ${loc.file}${loc.line ? ':' + loc.line : ''}${loc.column ? ':' + loc.column : ''}
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

    <button class="button button-primary ${this.isAnalyzing ? 'disabled' : ''}" onclick="openReport()" ${this.isAnalyzing ? 'disabled' : ''}>
      <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9 2L7 2 7 7 2 7 2 9 7 9 7 14 9 14 9 9 14 9 14 7 9 7z"/>
      </svg>
      Voir le rapport complet
    </button>
    ` : ''}

      ${this.usageData && !this.usageData.canAnalyze ? `
      <div class="limit-reached">
        <span>Limite quotidienne atteinte (${this.usageData.daily.used}/${this.usageData.daily.limit})</span>
        <span class="limit-reset">Réinitialisation dans ${this.usageData.daily.resetsIn}</span>
      </div>
      <button class="button button-primary" onclick="openProPage()">
        <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 1.5l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L3 5l3.5-.5 2-3z"/>
        </svg>
        Devenir Pro
      </button>
      ` : `
      <button class="button button-secondary ${this.isAnalyzing ? 'disabled' : ''}" onclick="analyze()" ${this.isAnalyzing ? 'disabled' : ''}>
        <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l6.25 11H1.75L8 1z"/>
        </svg>
        ${this.isAnalyzing ? 'Analyse en cours...' : (this.lastAnalysis ? 'Nouvelle analyse' : 'Analyser le projet')}
      </button>
      `}
    </div>

    <!-- Tab Content: Usage -->
    <div class="tab-content" id="tab-usage">
      ${this.usageData ? `
      <div class="results">
        <div class="result-header">Statut</div>

        <div class="result-item">
          <span class="result-label">Type de compte</span>
          <span class="result-value">${this.usageData.isPremium ? '⭐ Pro' : 'Gratuit'}</span>
        </div>

        <div class="result-item">
          <span class="result-label">Peut analyser</span>
          <span class="result-value">${this.usageData.canAnalyze ? '✓ Oui' : '✗ Non'}</span>
        </div>
      </div>

      ${!this.usageData.isPremium ? `
      <button class="button button-primary" onclick="openProPage()">
        <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 1.5l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L3 5l3.5-.5 2-3z"/>
        </svg>
        Devenir Pro
      </button>
      ` : ''}

      <div class="results">
        <div class="result-header">Quota journalier</div>

        <div class="result-item">
          <span class="result-label">Utilisées</span>
          <span class="result-value">${this.usageData.isPremium ? 'Illimité' : `${this.usageData.daily.used} / ${this.usageData.daily.limit}`}</span>
        </div>

        <div class="result-item">
          <span class="result-label">Restantes</span>
          <span class="result-value">${this.usageData.isPremium ? 'Illimité' : this.usageData.daily.remaining}</span>
        </div>

        <div class="result-item">
          <span class="result-label">Réinitialisation</span>
          <span class="result-value">${this.usageData.daily.resetsIn}</span>
        </div>
      </div>

      <div class="results">
        <div class="result-header">Limite de taux</div>

        <div class="result-item">
          <span class="result-label">Utilisées</span>
          <span class="result-value">${this.usageData.rateLimit.used} / ${this.usageData.rateLimit.limit}</span>
        </div>

        <div class="result-item">
          <span class="result-label">Restantes</span>
          <span class="result-value">${this.usageData.rateLimit.remaining}</span>
        </div>

        <div class="result-item">
          <span class="result-label">Réinitialisation</span>
          <span class="result-value">${this.usageData.rateLimit.resetsIn}</span>
        </div>
      </div>
      ` : `
      <div class="results">
        <div class="result-header">Chargement...</div>

        <div class="config-description">
          Récupération des données d'utilisation...
        </div>
      </div>
      `}
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
              <textarea class="form-textarea" id="config-ignore" placeholder="docs&#10;src/generated&#10;**/*.min.js">docs
src/generated
**/*.min.js</textarea>
              <div class="form-help">Patterns glob supportés : *, **, *.ext</div>
            </div>

            <div class="form-group">
              <label class="form-label">Règles désactivées (IDs séparés par des virgules)</label>
              <input type="text" class="form-input" id="config-disabled-rules" placeholder="eval-usage, no-console" value="">
              <div class="form-help-row">
                <span>IDs des règles à désactiver</span>
                <button class="button-link" onclick="openRulesList()">Voir les règles</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Lignes max par fichier</label>
              <input type="number" class="form-input" id="config-max-lines" value="500" min="100" max="10000">
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

    function disconnect() {
      vscode.postMessage({ type: 'disconnect' });
    }

    function analyze() {
      vscode.postMessage({ type: 'analyze' });
    }

    function openReport() {
      vscode.postMessage({ type: 'openReport' });
    }

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

    function openProPage() {
      vscode.postMessage({ type: 'openProPage' });
    }

    function openRulesList() {
      vscode.postMessage({ type: 'openRulesList' });
    }
  </script>
</body>
</html>`;
  }
}
