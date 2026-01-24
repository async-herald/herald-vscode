import * as vscode from 'vscode';
import { HERALD_CONFIG } from './config';
import { HeraldAuthService } from './auth.service';

interface AnalyzeRequest {
  projectName: string;
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
}

interface Scores {
  security: number;
  dependencies: number;
  architecture: number;
  deadcode: number;
  naming: number;
  style: number;
  commits: number;
  duplicates: number;
  placeholders: number;
  quality: number;
  tests: number;
  overall: number;
  grade: string;
}

export interface Issue {
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
}

interface Stats {
  totalFiles: number;
  analyzedFiles: number;
  totalLines: number;
  issuesCount: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  issuesByCategory: Record<string, number>;
}

interface AnalyzeResponse {
  success: boolean;
  reportId: number;
  analysis: {
    projectName: string;
    scores: Scores;
    issues: Issue[];
    stats: Stats;
    analyzedAt: string;
  };
}

export interface UsageResponse {
  isPremium: boolean;
  daily: {
    limit: number;
    used: number;
    remaining: number;
    resetsIn: string;
  };
  rateLimit: {
    limit: number;
    used: number;
    remaining: number;
    resetsIn: string;
  };
  canAnalyze: boolean;
}

export class HeraldService {
  private authService: HeraldAuthService;

  constructor(authService: HeraldAuthService) {
    this.authService = authService;
  }

  public mapToSixCategories(scores: Scores): {
    structure: number;
    security: number;
    ai_patterns: number;
    performance: number;
    quality: number;
    documentation: number;
  } {
    return {
      structure: scores.architecture,
      security: scores.security,
      ai_patterns: scores.placeholders,
      performance: Math.round((scores.deadcode + scores.duplicates) / 2),
      quality: scores.quality,
      documentation: scores.tests
    };
  }

  async analyzeWorkspace(): Promise<AnalyzeResponse | null> {
    const token = await this.authService.getToken();

    if (!token) {
      vscode.window.showErrorMessage('Veuillez vous authentifier d\'abord');
      return null;
    }

    const files = await this.collectFiles();

    if (files.length === 0) {
      vscode.window.showWarningMessage('Aucun fichier à analyser');
      return null;
    }

    const workspaceName = vscode.workspace.name || 'Unknown Project';
    const request: AnalyzeRequest = {
      projectName: workspaceName,
      files
    };

    try {
      const response = await fetch(
        `${HERALD_CONFIG.API_URL}/heralds/analyze-local`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(request)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };

        // Gérer les erreurs spécifiques
        if (response.status === 413) {
          vscode.window.showErrorMessage(
            'Payload trop volumineux. Le projet contient trop de fichiers ou des fichiers trop gros. Vérifiez les exclusions.'
          );
          return null;
        } else if (response.status === 429) {
          // Retourner l'erreur pour permettre un traitement spécifique (ex: proposer Pro)
          return errorData as unknown as AnalyzeResponse;
        } else {
          throw new Error(`API Error: ${response.status}`);
        }
      }

      const data = await response.json() as AnalyzeResponse & { error?: string };
      console.log('📡 Réponse brute de l\'API:', JSON.stringify(data, null, 2));

      // Vérifier si la réponse contient une erreur (ex: limite atteinte)
      if (data.error) {
        return data as unknown as AnalyzeResponse;
      }

      return data;
    } catch (error) {
      vscode.window.showErrorMessage(`Erreur d'analyse: ${error}`);
      return null;
    }
  }

  async getUsage(): Promise<UsageResponse | null> {
    const token = await this.authService.getToken();

    if (!token) {
      return null;
    }

    try {
      const response = await fetch(
        `${HERALD_CONFIG.API_URL}/heralds/usage`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        console.error(`Erreur lors de la récupération de l'usage: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data as UsageResponse;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'usage:', error);
      return null;
    }
  }

  private async collectFiles() {
    const files: Array<{ path: string; content: string; language: string }> = [];

    // Patterns de fichiers à INCLURE
    const includePatterns = [
      '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx',
      '**/*.py', '**/*.rs', '**/*.go', '**/*.java',
      '**/*.c', '**/*.cpp', '**/*.cs', '**/*.php'
    ];

    // Patterns à EXCLURE (comme .gitignore)
    const excludePatterns = [
      // Dépendances
      '**/node_modules/**',
      '**/vendor/**',
      '**/packages/**',

      // Build output
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/out/**',
      '**/.next/**',

      // Contrôle de version
      '**/.git/**',
      '**/.svn/**',

      // IDE
      '**/.vscode/**',
      '**/.idea/**',

      // Cache
      '**/coverage/**',
      '**/.cache/**',
      '**/tmp/**',
      '**/temp/**',

      // Fichiers minifiés
      '**/*.min.js',
      '**/*.min.css',
      '**/*.bundle.js',

      // Lock files (volumineux et inutiles)
      '**/package-lock.json',
      '**/yarn.lock',
      '**/Cargo.lock',
      '**/poetry.lock',

      // Assets binaires
      '**/*.png',
      '**/*.jpg',
      '**/*.jpeg',
      '**/*.gif',
      '**/*.svg',
      '**/*.ico',
      '**/*.woff',
      '**/*.woff2',
      '**/*.ttf',
      '**/*.eot',
      '**/*.pdf',
      '**/*.zip',
      '**/*.tar.gz',
    ];

    // Limites de sécurité (selon le guide Herald)
    const MAX_FILES = 500;                        // Max 500 fichiers
    const MAX_FILE_SIZE = 1024 * 1024;            // Max 1 MB par fichier
    const MAX_TOTAL_SIZE = 40 * 1024 * 1024;      // Max 40 MB total

    let totalSize = 0;
    let skippedFiles = 0;
    let skippedSize = 0;

    for (const pattern of includePatterns) {
      if (files.length >= MAX_FILES) break;
      if (totalSize >= MAX_TOTAL_SIZE) break;

      const uris = await vscode.workspace.findFiles(
        pattern,
        `{${excludePatterns.join(',')}}` // Combine tous les excludes
      );

      for (const uri of uris) {
        if (files.length >= MAX_FILES) break;
        if (totalSize >= MAX_TOTAL_SIZE) break;

        try {
          const stat = await vscode.workspace.fs.stat(uri);

          // Skip si fichier trop gros
          if (stat.size > MAX_FILE_SIZE) {
            console.log(`⚠️ Fichier ignoré (trop gros): ${uri.fsPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
            skippedFiles++;
            skippedSize += stat.size;
            continue;
          }

          const document = await vscode.workspace.openTextDocument(uri);
          const content = document.getText();
          const fileSize = Buffer.byteLength(content, 'utf8');

          if (totalSize + fileSize > MAX_TOTAL_SIZE) {
            console.log(`⚠️ Limite totale atteinte (${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)} MB), arrêt de la collecte`);
            break;
          }

          files.push({
            path: vscode.workspace.asRelativePath(uri),
            content: content,
            language: document.languageId
          });

          totalSize += fileSize;
        } catch (error) {
          console.error(`❌ Erreur lecture ${uri.fsPath}:`, error);
        }
      }
    }

    // Logs de statistiques
    console.log(`
📊 Statistiques de collecte:
  ✅ Fichiers collectés: ${files.length}
  📦 Taille totale: ${(totalSize / 1024 / 1024).toFixed(2)} MB
  ⚠️ Fichiers ignorés: ${skippedFiles}
  💾 Espace économisé: ${(skippedSize / 1024 / 1024).toFixed(2)} MB
    `);

    if (files.length === 0) {
      vscode.window.showWarningMessage('Aucun fichier trouvé pour l\'analyse');
    } else if (files.length >= MAX_FILES) {
      vscode.window.showWarningMessage(
        `Limite de ${MAX_FILES} fichiers atteinte. Certains fichiers n'ont pas été analysés.`
      );
    }

    return files;
  }
}
