import * as vscode from 'vscode';

export class HeraldFileDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Vérifier si le fichier est herald.config.json
    if (uri.path.endsWith('herald.config.json')) {
      return {
        badge: 'H',
        tooltip: 'Configuration Async Herald',
        color: new vscode.ThemeColor('charts.orange')
      };
    }
    return undefined;
  }

  refresh(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }
}
