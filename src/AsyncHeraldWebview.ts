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
  private activeTab: 'analysis' | 'config' = 'analysis';

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
        case 'tab':
          this.activeTab = data.tab === 'config' ? 'config' : 'analysis';
          break;
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

  private escape(text: string | undefined): string {
    return (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  /** Ton d'une note, comme dans l'app : bon (80+), moyen (60+), faible. */
  private tone(score: number): 'good' | 'mid' | 'bad' {
    return score >= 80 ? 'good' : score >= 60 ? 'mid' : 'bad';
  }

  private nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 32; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }

  /** Jauge circulaire (même dessin que la carte d'analyse de l'app). */
  private ring(value: number, tone: string, label: string, id = ''): string {
    const r = 20;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - Math.max(0, Math.min(1, value)));
    return `
      <div class="ring">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle class="ring-track" cx="24" cy="24" r="${r}" />
          <circle class="ring-value tone-${tone}" ${id ? `id="${id}"` : ''} cx="24" cy="24" r="${r}"
            stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" />
        </svg>
        <span class="ring-label" ${id ? `id="${id}-label"` : ''}>${label}</span>
      </div>`;
  }

  /** Carte affichée pendant l'analyse : étape réelle, barre, temps écoulé. */
  private renderRun(): string {
    return `
      <div class="card run">
        ${this.ring(0, 'accent', '0 %', 'run-ring')}
        <div class="run-body">
          <div class="run-step" id="run-step">Préparation…</div>
          <div class="muted small"><span id="run-elapsed">0 s</span> · analyse locale, aucun fichier envoyé</div>
          <div class="bar"><div class="bar-fill accent" id="run-bar" style="width: 0%"></div></div>
        </div>
      </div>`;
  }

  /** Panneau de la note (P11 minimal) et catégories. */
  private renderReport(report: DesktopReport): string {
    const delta = report.previousScore !== undefined ? report.score - report.previousScore : undefined;
    const deltaText =
      delta === undefined
        ? 'Première analyse'
        : delta === 0
          ? 'Stable depuis la dernière analyse'
          : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} depuis la dernière analyse`;
    const issues = report.issues.length;
    const critical = report.issues.filter(issue => issue.severity === 'critical').length;
    const analyzed = report.analyzedAt ? this.formatTimestamp(new Date(report.analyzedAt)) : '';

    const ids = Object.keys(CATEGORY_LABELS);
    report.categories.forEach(category => {
      if (!ids.includes(category.id)) {
        ids.push(category.id);
      }
    });
    const rows = ids
      .map(id => ({ id, category: report.categories.find(c => c.id === id) }))
      // Catégories sans rien à examiner en dernier.
      .sort((x, y) => Number(y.category?.applicable ?? false) - Number(x.category?.applicable ?? false))
      .map(({ id, category }) => this.renderCategory(id, category, report.issues.filter(i => i.category === id)))
      .join('');

    return `
      <section class="score">
        <div class="score-line">
          <span class="score-value">${report.score}</span><span class="score-max">/100</span>
          <span class="grade tone-${this.tone(report.score)}">${this.escape(report.grade)}</span>
        </div>
        <div class="score-delta ${delta === undefined || delta === 0 ? '' : delta > 0 ? 'tone-good' : 'tone-bad'}">${deltaText}</div>
        <div class="muted small">
          ${issues} problème${issues > 1 ? 's' : ''}${critical ? ` dont <span class="tone-bad">${critical} critique${critical > 1 ? 's' : ''}</span>` : ''}
          · ${report.files.toLocaleString('fr-FR')} fichiers
          · ${(report.durationMs / 1000).toFixed(1).replace('.', ',')} s${analyzed ? ` · ${analyzed.toLowerCase()}` : ''}
        </div>
      </section>

      <div class="section-title">Catégories</div>
      <div class="categories">${rows}</div>

      <div class="actions">
        <button class="btn" data-action="analyze">Relancer l'analyse</button>
        <button class="btn ghost" data-action="openInDesktop">Voir dans Async Herald</button>
      </div>`;
  }

  private renderCategory(
    id: string,
    category: DesktopReport['categories'][number] | undefined,
    issues: DesktopIssue[]
  ): string {
    const applicable = category?.applicable ?? false;
    const score = category?.score ?? 100;
    const rules = this.groupByRule(issues);
    const label = this.escape(category?.label ?? categoryLabel(id));
    const count = issues.length;
    const detail = rules
      .map(group => {
        const MAX_SHOWN = 8;
        const location = (loc: { file: string; line?: number }) => `
              <button class="location" data-action="openFile" data-file="${this.escape(loc.file)}" data-line="${loc.line ?? 0}">
                ${this.escape(loc.file)}${loc.line ? `<span class="muted">:${loc.line}</span>` : ''}
              </button>`;
        const shown = group.locations.slice(0, MAX_SHOWN).map(location).join('');
        const rest = group.locations.slice(MAX_SHOWN);
        const locations = rest.length
          ? `${shown}<details class="more"><summary class="link">${rest.length} autre${rest.length > 1 ? 's' : ''}</summary>${rest.map(location).join('')}</details>`
          : shown;
        return `
          <details class="rule">
            <summary>
              <span class="dot sev-${group.issue.severity}" title="${group.issue.severity}"></span>
              <span class="rule-title">${this.escape(group.issue.title)}</span>
              <span class="muted small">${Math.max(group.locations.length, 1)}</span>
            </summary>
            <div class="rule-body">
              ${group.issue.explanation ? `<p>${this.escape(group.issue.explanation)}</p>` : ''}
              ${group.issue.fix ? `<p><span class="muted">Correction :</span> ${this.escape(group.issue.fix)}</p>` : ''}
              ${locations}
            </div>
          </details>`;
      })
      .join('');

    return `
      <details class="category ${applicable ? '' : 'inactive'}" ${count === 0 ? 'data-empty' : ''}>
        <summary>
          <span class="category-row">
            <span class="category-name">${label}</span>
            <span class="muted small">${applicable ? (count ? `${count} problème${count > 1 ? 's' : ''}` : 'aucun problème') : 'rien à examiner'}</span>
            <span class="category-grade ${applicable ? `tone-${this.tone(score)}` : 'muted'}">${applicable && category ? this.escape(category.grade) : '—'}</span>
          </span>
          <span class="bar thin"><span class="bar-fill tone-${applicable ? this.tone(score) : 'none'}" style="width: ${applicable ? score : 0}%"></span></span>
        </summary>
        ${count ? `<div class="rules">${detail}</div>` : ''}
      </details>`;
  }

  private renderAnalysis(): string {
    if (this.isAnalyzing) {
      return this.renderRun();
    }
    if (this.report) {
      return this.renderReport(this.report);
    }
    return `
      <div class="empty">
        <p>Aucune analyse pour ce projet.</p>
        <p class="muted small">L'analyse tourne sur votre machine avec Async Herald Desktop : aucun fichier n'est envoyé.</p>
        <button class="btn primary" data-action="analyze">Analyser le projet</button>
      </div>`;
  }

  private renderConfig(): string {
    if (!this.hasConfigFile) {
      return `
        <p class="muted">Créez un fichier <code>herald.config.json</code> à la racine pour personnaliser l'analyse. Async Herald Desktop le lit à chaque analyse.</p>
        <button class="btn primary" data-action="createConfig">Créer herald.config.json</button>
        <div class="section-title">Exemple</div>
        <pre class="code">{
  "ignore": ["docs", "src/generated", "**/*.min.js"],
  "rules": { "disable": ["eval-usage"] },
  "thresholds": { "maxFileLines": 500 }
}</pre>
        <div class="section-title">Options</div>
        <dl class="options">
          <dt>ignore</dt><dd>Fichiers et dossiers à exclure (motifs glob).</dd>
          <dt>rules.disable</dt><dd>Identifiants des règles à désactiver.</dd>
          <dt>thresholds.maxFileLines</dt><dd>Nombre maximal de lignes par fichier (300 par défaut).</dd>
        </dl>`;
    }
    const config = this.configData as { ignore?: string[]; rules?: { disable?: string[] }; thresholds?: { maxFileLines?: number } } | undefined;
    return `
      <label class="field">
        <span>Fichiers à ignorer <span class="muted">(un par ligne, motifs glob)</span></span>
        <textarea id="config-ignore" rows="5" placeholder="docs&#10;src/generated&#10;**/*.min.js">${this.escape(config?.ignore?.join('\n') ?? '')}</textarea>
      </label>
      <label class="field">
        <span>Règles désactivées <span class="muted">(identifiants séparés par des virgules)</span></span>
        <input type="text" id="config-disabled-rules" placeholder="eval-usage, no-console" value="${this.escape(config?.rules?.disable?.join(', ') ?? '')}">
        <button class="link" data-action="openRulesList">Voir les règles</button>
      </label>
      <label class="field">
        <span>Lignes maximales par fichier</span>
        <input type="number" id="config-max-lines" value="${config?.thresholds?.maxFileLines ?? 300}" min="100" max="10000">
      </label>
      <div class="actions">
        <button class="btn primary" data-action="saveConfig">Enregistrer</button>
        <button class="btn ghost" data-action="openConfig">Éditer le JSON</button>
      </div>`;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = this.nonce();
    const analysisActive = this.activeTab !== 'config';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --accent: #EAA11A;
      --on-accent: #2B2318;
      --good: #2F7A4A;
      --mid: #8F5F00;
      --bad: #B8372A;
      --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
      --muted: var(--vscode-descriptionForeground);
      --track: rgba(128, 128, 128, 0.2);
      --hover: var(--vscode-list-hoverBackground);
    }
    body.vscode-dark, body.vscode-high-contrast {
      --good: #6CC28A;
      --mid: #E0A63A;
      --bad: #EF7A6A;
      --on-accent: #1B1712;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 14px 20px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: transparent;
      line-height: 1.45;
    }
    button { font: inherit; color: inherit; }
    code, .code, .location { font-family: var(--vscode-editor-font-family); }
    .muted { color: var(--muted); }
    .small { font-size: 11px; }
    .tone-good { color: var(--good); }
    .tone-mid { color: var(--mid); }
    .tone-bad { color: var(--bad); }

    /* En-tête */
    .header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .header .app { flex: 1; min-width: 0; color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .link { background: none; border: 0; padding: 0; color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; }
    .link:hover { text-decoration: underline; }

    /* Onglets soulignés, comme dans l'app */
    .tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
    .tab { background: none; border: 0; padding: 6px 0; margin-bottom: -1px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
    .tab:hover { color: var(--vscode-foreground); }
    .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--accent); }
    .panel { display: none; }
    .panel.active { display: block; }

    /* Boutons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 28px; padding: 0 12px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--border); background: transparent;
    }
    .btn:hover { background: var(--hover); }
    .btn.primary { width: 100%; background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
    .btn.primary:hover { filter: brightness(1.05); }
    .btn.ghost { border-color: transparent; color: var(--vscode-textLink-foreground); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }

    /* Carte d'analyse */
    .card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    .run { display: flex; align-items: center; gap: 12px; }
    .run-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .run-step { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ring { position: relative; width: 48px; height: 48px; flex: none; }
    .ring svg { width: 48px; height: 48px; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 5; }
    .ring-track { stroke: var(--track); }
    .ring-value { stroke-linecap: round; transition: stroke-dashoffset 0.3s ease; }
    .ring-value.tone-accent { stroke: var(--accent); }
    .ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }

    /* Barres */
    .bar { height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; margin-top: 4px; }
    .bar.thin { height: 3px; margin: 0; }
    .bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
    .bar-fill.accent { background: var(--accent); }
    .bar-fill.tone-good { background: var(--good); }
    .bar-fill.tone-mid { background: var(--mid); }
    .bar-fill.tone-bad { background: var(--bad); }

    /* Note (P11 minimal) */
    .score { padding: 4px 0 14px; border-bottom: 1px solid var(--border); }
    .score-line { display: flex; align-items: baseline; gap: 4px; }
    .score-value { font-size: 40px; font-weight: 300; line-height: 1; letter-spacing: -1px; }
    .score-max { color: var(--muted); font-size: 13px; }
    .grade { margin-left: auto; font-size: 22px; font-weight: 600; }
    .score-delta { margin: 6px 0 2px; font-size: 12px; }

    .section-title { margin: 16px 0 6px; font-size: 11px; color: var(--muted); }

    /* Catégories */
    .categories { display: flex; flex-direction: column; }
    details > summary { list-style: none; cursor: pointer; }
    details > summary::-webkit-details-marker { display: none; }
    .category { border-bottom: 1px solid var(--border); }
    .category > summary { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; }
    .category-row { display: flex; align-items: baseline; gap: 8px; }
    .bar.thin, .bar-fill { display: block; }
    .category > summary:hover .category-name { color: var(--vscode-textLink-foreground); }
    .category[data-empty] > summary { cursor: default; }
    .category-name { flex: 1; min-width: 0; }
    .category-grade { width: 24px; text-align: right; font-weight: 600; }
    .category.inactive .category-name { color: var(--muted); }
    .rules { padding: 2px 0 8px; }

    .rule > summary { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; }
    .rule > summary:hover { background: var(--hover); }
    .rule-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rule[open] .rule-title { white-space: normal; }
    .rule-body { padding: 2px 6px 8px 20px; font-size: 12px; }
    .rule-body p { margin: 4px 0; }
    .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
    .sev-critical { background: var(--bad); }
    .sev-warning { background: var(--mid); }
    .sev-info { background: var(--muted); }
    .location {
      display: block; width: 100%; text-align: left; background: none; border: 0;
      padding: 2px 4px; border-radius: 4px; cursor: pointer; font-size: 11px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .more > summary { padding: 2px 4px; }
    .more[open] > summary { display: none; }
    .location:hover { background: var(--hover); color: var(--vscode-textLink-foreground); }

    /* État vide */
    .empty { text-align: center; padding: 16px 4px; }
    .empty p { margin: 0 0 6px; }
    .empty .btn { margin-top: 10px; }

    /* Config */
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 12px; }
    .field .link { align-self: flex-start; }
    input, textarea {
      font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--border)); border-radius: 4px; padding: 5px 7px;
    }
    textarea { resize: vertical; font-family: var(--vscode-editor-font-family); }
    input:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .code { margin: 0; padding: 8px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); font-size: 11px; overflow-x: auto; }
    .options { margin: 0; font-size: 12px; }
    .options dt { font-family: var(--vscode-editor-font-family); margin-top: 6px; }
    .options dd { margin: 0; color: var(--muted); }
  </style>
</head>
<body>
  <div class="header">
    <span class="app">Async Herald Desktop${this.desktop.version ? ' ' + this.escape(this.desktop.version) : ''} · analyse locale</span>
    <button class="link" data-action="openInDesktop">Ouvrir l'app</button>
  </div>

  <div class="tabs">
    <button class="tab ${analysisActive ? 'active' : ''}" data-tab="analysis">Analyse</button>
    <button class="tab ${analysisActive ? '' : 'active'}" data-tab="config">Config</button>
  </div>

  <div class="panel ${analysisActive ? 'active' : ''}" id="panel-analysis">
    ${this.renderAnalysis()}
  </div>
  <div class="panel ${analysisActive ? '' : 'active'}" id="panel-config">
    ${this.renderConfig()}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const CIRCUMFERENCE = ${(2 * Math.PI * 20).toFixed(2)};

    document.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        const name = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
        vscode.postMessage({ type: 'tab', tab: name });
        return;
      }
      const target = event.target.closest('[data-action]');
      if (!target) {
        return;
      }
      const action = target.dataset.action;
      if (action === 'openFile') {
        vscode.postMessage({ type: 'openFile', file: target.dataset.file, line: Number(target.dataset.line) || 0, column: 0 });
      } else if (action === 'saveConfig') {
        const lines = value => value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
        vscode.postMessage({
          type: 'saveConfig',
          config: {
            ignore: lines(document.getElementById('config-ignore').value),
            rules: { disable: document.getElementById('config-disabled-rules').value.split(',').map(s => s.trim()).filter(Boolean) },
            thresholds: { maxFileLines: parseInt(document.getElementById('config-max-lines').value, 10) || 300 },
          },
        });
      } else {
        vscode.postMessage({ type: action });
      }
    });

    // Une catégorie sans problème ne se déplie pas.
    document.querySelectorAll('.category[data-empty] > summary').forEach(summary =>
      summary.addEventListener('click', event => event.preventDefault())
    );

    // Analyse en cours : temps écoulé et progression envoyée par l'app.
    const elapsed = document.getElementById('run-elapsed');
    if (elapsed) {
      const started = Date.now();
      setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        elapsed.textContent = seconds < 60 ? seconds + ' s' : Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
      }, 1000);
    }
    window.addEventListener('message', event => {
      const data = event.data;
      if (!data || data.type !== 'progress') {
        return;
      }
      const percent = Math.max(0, Math.min(100, data.percent));
      const ring = document.getElementById('run-ring');
      const label = document.getElementById('run-ring-label');
      const bar = document.getElementById('run-bar');
      const step = document.getElementById('run-step');
      if (ring) ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - percent / 100));
      if (label) label.textContent = percent + ' %';
      if (bar) bar.style.width = percent + '%';
      if (step && data.message) step.textContent = data.message;
    });
  </script>
</body>
</html>`;
  }
}
