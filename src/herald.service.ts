import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HERALD_CONFIG } from './config';
import { HeraldAuthService } from './auth.service';

// Fichiers sensibles : JAMAIS envoyés au serveur, quelle que soit la configuration.
// Volontairement non surchargeable depuis herald.config.json.
const SENSITIVE_EXCLUDE_PATTERNS = [
  // Variables d'environnement
  '**/.env',
  '**/.env.*',
  '**/*.env',
  '**/env.json',
  // Clés et certificats
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.jks',
  '**/*.keystore',
  '**/id_rsa',
  '**/id_dsa',
  '**/id_ecdsa',
  '**/id_ed25519',
  // Credentials divers
  '**/.npmrc',
  '**/.netrc',
  '**/.pgpass',
  '**/secrets.*',
  '**/credentials.*',
];

// Second filet de sécurité, appliqué sur le chemin de chaque fichier après le
// findFiles : si un pattern d'inclusion évolue, rien de sensible ne passe.
const SENSITIVE_PATH_REGEXES = [
  /(^|\/)\.env($|\.)/i,                          // .env, .env.local, .env.production
  /(^|\/)[^/]*\.env$/i,                          // config.env, prod.env
  /(^|\/)env\.json$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i,
  /(^|\/)\.(npmrc|netrc|pgpass)$/i,
  /(^|\/)(secrets?|credentials)\./i,
];

function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return SENSITIVE_PATH_REGEXES.some(re => re.test(normalized));
}

interface AnalyzeRequest {
  projectName: string;
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
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
  family?: string;
}

interface HeraldFamily {
  name: string;
  displayName: string;
  score: number;
  issuesCount: number;
  issues: Issue[];
}

interface AnalyzeResponse {
  success: boolean;
  reportId: number;
  isLocal: boolean;
  analysis: {
    projectName: string;
    analyzedAt: string;
    // Score officiel du dépôt, calculé et persisté par le serveur (densité sur les
    // totaux). À afficher tel quel : c'est le MÊME chiffre que le rapport en ligne.
    scores?: {
      overall: number;
      grade: string;
    };
    families: {
      uriel: HeraldFamily;
      auriel: HeraldFamily;
      barachiel: HeraldFamily;
      zadkiel: HeraldFamily;
      raziel: HeraldFamily;
      cassiel: HeraldFamily;
    };
    stats: {
      totalFiles: number;
      analyzedFiles: number;
      totalLines: number;
      issuesCount: {
        total: number;
        critical: number;
        info: number;
        warning: number;
      };
    };
  };
}

export interface HistoryEntry {
  id: number;
  repoName: string;
  repoFullName: string;
  repoUrl: string | null;
  branch: string;
  isLocal: boolean;
  overall: number;
  grade: string;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  totalFiles: number;
  analyzedFiles: number;
  totalLines: number;
  createdAt: string;
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
  private logFilePath: string;

  constructor(authService: HeraldAuthService) {
    this.authService = authService;
    // Créer le fichier de log dans le dossier workspace ou home
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      this.logFilePath = path.join(workspaceFolders[0].uri.fsPath, '.herald-error.log');
    } else {
      this.logFilePath = path.join(process.env.HOME || '/tmp', '.herald-error.log');
    }
  }

  private async writeErrorLog(errorDetails: {
    timestamp: string;
    statusCode: number;
    statusText: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    responseBody: unknown;
    requestInfo: {
      projectName: string;
      filesCount: number;
      totalPayloadSize: string;
      largestFile: { path: string; size: string };
    };
  }): Promise<void> {
    const logEntry = `
================================================================================
HERALD ERROR LOG - ${errorDetails.timestamp}
================================================================================

🔴 ERREUR HTTP ${errorDetails.statusCode} (${errorDetails.statusText})

📡 REQUÊTE
  URL: ${errorDetails.url}
  Méthode: ${errorDetails.method}

📦 PAYLOAD
  Projet: ${errorDetails.requestInfo.projectName}
  Nombre de fichiers: ${errorDetails.requestInfo.filesCount}
  Taille totale: ${errorDetails.requestInfo.totalPayloadSize}
  Plus gros fichier: ${errorDetails.requestInfo.largestFile.path} (${errorDetails.requestInfo.largestFile.size})

📥 RÉPONSE DU SERVEUR
  Headers: ${JSON.stringify(errorDetails.headers, null, 2)}
  Body: ${JSON.stringify(errorDetails.responseBody, null, 2)}

================================================================================

`;

    try {
      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
      console.log(`📝 Log d'erreur écrit dans: ${this.logFilePath}`);
    } catch (err) {
      console.error('❌ Impossible d\'écrire le fichier de log:', err);
    }
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

    // Calculer les stats pour le debug
    const filesWithSize = files.map(f => ({
      path: f.path,
      size: Buffer.byteLength(f.content, 'utf8')
    }));
    const largestFile = filesWithSize.reduce((max, f) => f.size > max.size ? f : max, filesWithSize[0]);
    const payloadSize = Buffer.byteLength(JSON.stringify(request), 'utf8');

    try {
      const response = await fetch(
        `${HERALD_CONFIG.API_URL}/heralds/analyze/local-run`,
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
          const payloadMB = (payloadSize / 1024 / 1024).toFixed(2);
          const largestMB = (largestFile.size / 1024 / 1024).toFixed(2);
          vscode.window.showErrorMessage(
            `Payload trop volumineux (${payloadMB} MB). Fichier le plus gros: ${largestFile.path} (${largestMB} MB). Vérifiez les exclusions.`
          );
          console.log(`❌ Payload: ${payloadMB} MB | Fichiers: ${files.length} | Plus gros: ${largestFile.path} (${largestMB} MB)`);
          return null;
        } else if (response.status === 429) {
          // Retourner l'erreur pour permettre un traitement spécifique (ex: proposer Pro)
          return errorData as unknown as AnalyzeResponse;
        } else if (response.status >= 500 && response.status < 600) {
          // Erreurs serveur (502, 503, etc.) - log détaillé dans un fichier
          const payloadMB = (payloadSize / 1024 / 1024).toFixed(2);
          const largestMB = (largestFile.size / 1024 / 1024).toFixed(2);

          // Collecter les headers de réponse
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          await this.writeErrorLog({
            timestamp: new Date().toISOString(),
            statusCode: response.status,
            statusText: response.statusText,
            url: `${HERALD_CONFIG.API_URL}/heralds/analyze/local-run`,
            method: 'POST',
            headers: responseHeaders,
            responseBody: errorData,
            requestInfo: {
              projectName: workspaceName,
              filesCount: files.length,
              totalPayloadSize: `${payloadMB} MB`,
              largestFile: { path: largestFile.path, size: `${largestMB} MB` }
            }
          });

          const errorMsg = errorData.error || `Erreur serveur ${response.status}`;
          console.error(`❌ Erreur serveur ${response.status}:`, errorData);
          vscode.window.showErrorMessage(
            `Erreur serveur (${response.status}): ${errorMsg}. Détails dans .herald-error.log`
          );
          return null;
        } else {
          const errorMsg = errorData.error || `Erreur HTTP ${response.status}`;
          console.error(`❌ API Error ${response.status}:`, errorData);
          vscode.window.showErrorMessage(`Erreur API: ${errorMsg}`);
          return null;
        }
      }

      const data = await response.json() as AnalyzeResponse & { error?: string };
      console.log('📡 Réponse brute de l\'API:', JSON.stringify(data, null, 2));

      // Valider la structure de la réponse
      if (!data.analysis && !data.error) {
        console.error('❌ Structure de réponse invalide:', data);
        vscode.window.showErrorMessage('Réponse API invalide: structure inattendue');
        return null;
      }

      // Vérifier si la réponse contient une erreur (ex: limite atteinte)
      if (data.error) {
        return data as unknown as AnalyzeResponse;
      }

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Exception lors de l\'analyse:', error);
      vscode.window.showErrorMessage(`Erreur d'analyse: ${errorMessage}`);
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

  async getHistory(): Promise<HistoryEntry[] | null> {
    const token = await this.authService.getToken();

    if (!token) {
      return null;
    }

    try {
      const response = await fetch(
        `${HERALD_CONFIG.API_URL}/heralds/reports/me`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        console.error(`Erreur lors de la récupération de l'historique: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data as HistoryEntry[];
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique:', error);
      return null;
    }
  }

  private async loadHeraldConfig(): Promise<{ ignore?: string[] }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return {};
    }

    const configPath = vscode.Uri.joinPath(workspaceFolders[0].uri, 'herald.config.json');
    try {
      const configContent = await vscode.workspace.fs.readFile(configPath);
      const config = JSON.parse(Buffer.from(configContent).toString('utf8'));
      if (config.ignore?.length) {
        console.log(`📋 herald.config.json chargé - ${config.ignore.length} pattern(s) ignoré(s)`);
      }
      return config;
    } catch {
      return {};
    }
  }

  private getExcludePatterns(heraldConfig: { ignore?: string[] }): string[] {
    const excludePatterns = [
      // Fichiers sensibles (env, clés, credentials) — non négociable
      ...SENSITIVE_EXCLUDE_PATTERNS,

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

    // Ajouter les patterns d'ignore depuis herald.config.json
    if (heraldConfig.ignore?.length) {
      for (const pattern of heraldConfig.ignore) {
        // Normaliser le pattern (ajouter **/ si c'est un dossier simple)
        const normalizedPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
        excludePatterns.push(normalizedPattern);
        console.log(`🚫 Pattern ignoré (config): ${normalizedPattern}`);
      }
    }

    return excludePatterns;
  }

  async countFiles(): Promise<number> {
    const heraldConfig = await this.loadHeraldConfig();
    const excludePatterns = this.getExcludePatterns(heraldConfig);

    console.log(`📋 Comptage des fichiers avec ${heraldConfig.ignore?.length || 0} exclusion(s) custom`);
    if (heraldConfig.ignore?.length) {
      console.log('🚫 Exclusions custom:', heraldConfig.ignore);
    }

    const includePatterns = [
      // JavaScript / TypeScript
      '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs', '**/*.cjs',
      // Python
      '**/*.py',
      // Rust
      '**/*.rs',
      // Go
      '**/*.go',
      // Java / Kotlin / Scala / Groovy
      '**/*.java', '**/*.kt', '**/*.kts', '**/*.scala', '**/*.groovy',
      // C / C++ / C# / Objective-C
      '**/*.c', '**/*.cpp', '**/*.cc', '**/*.h', '**/*.hpp', '**/*.cs', '**/*.m', '**/*.mm',
      // PHP
      '**/*.php',
      // Ruby
      '**/*.rb',
      // Swift
      '**/*.swift',
      // Dart
      '**/*.dart',
      // Elixir / Erlang
      '**/*.ex', '**/*.exs', '**/*.erl', '**/*.hrl',
      // F# / Haskell
      '**/*.fs', '**/*.fsx', '**/*.hs', '**/*.lhs',
      // Lua
      '**/*.lua',
      // Perl
      '**/*.pl', '**/*.pm',
      // R
      '**/*.r', '**/*.R',
      // Julia
      '**/*.jl',
      // Clojure
      '**/*.clj', '**/*.cljs', '**/*.cljc',
      // Vue / Svelte
      '**/*.vue', '**/*.svelte',
      // Shell
      '**/*.sh', '**/*.bash', '**/*.zsh',
      // Web
      '**/*.html', '**/*.css', '**/*.scss', '**/*.sass', '**/*.less',
      // Config / Data
      '**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml',
      // SQL / GraphQL
      '**/*.sql', '**/*.graphql', '**/*.gql',
      // Infrastructure
      '**/*.tf', '**/*.tfvars', '**/Dockerfile', '**/Makefile',
      // Documentation
      '**/*.md'
    ];

    const MAX_FILES = 500;
    const MAX_FILE_SIZE = 2 * 1024 * 1024;
    let count = 0;

    for (const pattern of includePatterns) {
      if (count >= MAX_FILES) break;

      const uris = await vscode.workspace.findFiles(
        pattern,
        `{${excludePatterns.join(',')}}`
      );

      for (const uri of uris) {
        if (count >= MAX_FILES) break;

        if (isSensitivePath(vscode.workspace.asRelativePath(uri))) {
          continue;
        }

        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size <= MAX_FILE_SIZE) {
            count++;
          }
        } catch {
          // Ignore errors
        }
      }
    }

    console.log(`✅ Comptage terminé: ${count} fichier(s)`);
    return count;
  }

  private async collectFiles() {
    const files: Array<{ path: string; content: string; language: string }> = [];

    const heraldConfig = await this.loadHeraldConfig();
    const excludePatterns = this.getExcludePatterns(heraldConfig);

    // Patterns de fichiers à INCLURE
    const includePatterns = [
      // JavaScript / TypeScript
      '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs', '**/*.cjs',
      // Python
      '**/*.py',
      // Rust
      '**/*.rs',
      // Go
      '**/*.go',
      // Java / Kotlin / Scala / Groovy
      '**/*.java', '**/*.kt', '**/*.kts', '**/*.scala', '**/*.groovy',
      // C / C++ / C# / Objective-C
      '**/*.c', '**/*.cpp', '**/*.cc', '**/*.h', '**/*.hpp', '**/*.cs', '**/*.m', '**/*.mm',
      // PHP
      '**/*.php',
      // Ruby
      '**/*.rb',
      // Swift
      '**/*.swift',
      // Dart
      '**/*.dart',
      // Elixir / Erlang
      '**/*.ex', '**/*.exs', '**/*.erl', '**/*.hrl',
      // F# / Haskell
      '**/*.fs', '**/*.fsx', '**/*.hs', '**/*.lhs',
      // Lua
      '**/*.lua',
      // Perl
      '**/*.pl', '**/*.pm',
      // R
      '**/*.r', '**/*.R',
      // Julia
      '**/*.jl',
      // Clojure
      '**/*.clj', '**/*.cljs', '**/*.cljc',
      // Vue / Svelte
      '**/*.vue', '**/*.svelte',
      // Shell
      '**/*.sh', '**/*.bash', '**/*.zsh',
      // Web
      '**/*.html', '**/*.css', '**/*.scss', '**/*.sass', '**/*.less',
      // Config / Data
      '**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml',
      // SQL / GraphQL
      '**/*.sql', '**/*.graphql', '**/*.gql',
      // Infrastructure
      '**/*.tf', '**/*.tfvars', '**/Dockerfile', '**/Makefile',
      // Documentation
      '**/*.md'
    ];

    // Limites de sécurité (selon le guide Herald)
    const MAX_FILES = 500;                        // Max 500 fichiers
    const MAX_FILE_SIZE = 2 * 1024 * 1024;        // Max 2 MB par fichier
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

        const relativePath = vscode.workspace.asRelativePath(uri);
        if (isSensitivePath(relativePath)) {
          console.log(`🔒 Fichier sensible ignoré (non envoyé): ${relativePath}`);
          skippedFiles++;
          continue;
        }

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
            path: relativePath,
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
