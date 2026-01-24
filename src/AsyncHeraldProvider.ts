import * as vscode from 'vscode';

export enum HeraldItemType {
  STATUS = 'status',
  BUTTON = 'button',
  RESULT = 'result',
  SEPARATOR = 'separator',
  GROUP = 'group'
}

export interface HeraldItem {
  type: HeraldItemType;
  label: string;
  description?: string;
  command?: string;
  icon?: vscode.ThemeIcon | string;
  contextValue?: string;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  children?: HeraldItem[];
}

export class AsyncHeraldProvider implements vscode.TreeDataProvider<HeraldItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HeraldItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private isAuthenticated = false;
  private userEmail?: string;
  private lastAnalysis?: {
    score: number;
    grade: string;
    issuesCount: number;
    timestamp: Date;
  };

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setAuthenticated(isAuth: boolean, email?: string): void {
    this.isAuthenticated = isAuth;
    this.userEmail = email;
    this.refresh();
  }

  setAnalysisResult(score: number, grade: string, issuesCount: number): void {
    this.lastAnalysis = {
      score,
      grade,
      issuesCount,
      timestamp: new Date()
    };
    this.refresh();
  }

  clearAnalysisResult(): void {
    this.lastAnalysis = undefined;
    this.refresh();
  }

  getTreeItem(element: HeraldItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.collapsibleState || vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = element.description;
    treeItem.contextValue = element.contextValue;

    if (element.command) {
      treeItem.command = {
        command: element.command,
        title: element.label
      };
    }

    if (element.icon) {
      if (typeof element.icon === 'string') {
        treeItem.iconPath = element.icon;
      } else {
        treeItem.iconPath = element.icon;
      }
    }

    return treeItem;
  }

  getChildren(element?: HeraldItem): vscode.ProviderResult<HeraldItem[]> {
    if (element) {
      return element.children || [];
    }

    return this.getRootItems();
  }

  private getRootItems(): HeraldItem[] {
    // La vue non connectée est gérée par viewsWelcome dans package.json
    if (!this.isAuthenticated) {
      return [];
    }
    return this.getAuthenticatedView();
  }

  private getAuthenticatedView(): HeraldItem[] {
    const items: HeraldItem[] = [];

    // User info
    items.push({
      type: HeraldItemType.STATUS,
      label: this.userEmail || 'Connecté',
      icon: new vscode.ThemeIcon('account'),
      contextValue: 'userInfo'
    });

    items.push({
      type: HeraldItemType.BUTTON,
      label: 'Se déconnecter',
      command: 'async-herald.disconnect',
      icon: new vscode.ThemeIcon('sign-out'),
      contextValue: 'logoutButton'
    });

    // Analyze button
    items.push({
      type: HeraldItemType.BUTTON,
      label: 'Analyser le projet',
      command: 'async-herald.analyze',
      icon: new vscode.ThemeIcon('play'),
      contextValue: 'analyzeButton'
    });

    // Last analysis results
    if (this.lastAnalysis) {
      items.push({
        type: HeraldItemType.GROUP,
        label: 'Résultats',
        icon: new vscode.ThemeIcon('graph'),
        contextValue: 'resultsGroup',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            type: HeraldItemType.RESULT,
            label: `Score: ${this.lastAnalysis.score}/100`,
            description: this.lastAnalysis.grade,
            icon: this.getScoreIcon(this.lastAnalysis.score),
            contextValue: 'score'
          },
          {
            type: HeraldItemType.RESULT,
            label: `${this.lastAnalysis.issuesCount} problème(s)`,
            icon: new vscode.ThemeIcon(this.lastAnalysis.issuesCount > 0 ? 'warning' : 'pass'),
            contextValue: 'issues'
          },
          {
            type: HeraldItemType.RESULT,
            label: this.formatTimestamp(this.lastAnalysis.timestamp),
            icon: new vscode.ThemeIcon('clock'),
            contextValue: 'timestamp'
          },
          {
            type: HeraldItemType.BUTTON,
            label: 'Ouvrir le rapport',
            command: 'async-herald.openReport',
            icon: new vscode.ThemeIcon('link-external'),
            contextValue: 'openReport'
          }
        ]
      });
    }

    return items;
  }


  private getScoreIcon(score: number): vscode.ThemeIcon {
    if (score >= 80) {
      return new vscode.ThemeIcon('pass-filled');
    } else if (score >= 60) {
      return new vscode.ThemeIcon('warning');
    } else {
      return new vscode.ThemeIcon('error');
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
}
