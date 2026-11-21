// Rapport d'analyse rendu par Async Herald Desktop en mode ligne de commande
// (`herald-desktop --analyze <dossier> --json`). Format décrit dans DESKTOP-CLI.md.
// Ce module ne dépend pas de `vscode` : il est testable seul.

export type Severity = 'critical' | 'warning' | 'info';

export interface DesktopIssue {
  rule: string;
  title: string;
  severity: Severity;
  category: string;
  file: string;
  line?: number;
  explanation?: string;
  fix?: string;
}

export interface DesktopCategory {
  id: string;
  label: string;
  score: number;
  grade: string;
  /** Faux : rien à examiner dans ce projet (pas de fichier concerné). */
  applicable: boolean;
}

export interface DesktopReport {
  version: number;
  project: string;
  path: string;
  analyzedAt: string;
  durationMs: number;
  score: number;
  grade: string;
  previousScore?: number;
  files: number;
  categories: DesktopCategory[];
  issues: DesktopIssue[];
}

/** Erreur rendue par l'app (code de sortie non nul). */
export interface DesktopError {
  error: string;
  /** `not_signed_in`, `quota`, `no_files`, `invalid_path`… */
  code?: string;
}

/** Version du format comprise par cette extension. */
export const REPORT_VERSION = 1;

/** Ordre et libellés des catégories, comme dans l'app. */
export const CATEGORY_LABELS: Record<string, string> = {
  security: 'Sécurité',
  quality: 'Qualité',
  git: 'Versioning',
  devops: 'DevOps',
  pattern: 'Pattern',
  dependencies: 'Dépendances',
  tests: 'Tests',
};

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] ?? id;
}

/** Lit la sortie JSON de l'app : un rapport, ou une erreur explicite. */
export function parseDesktopOutput(stdout: string): DesktopReport | DesktopError {
  let data: unknown;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    return { error: 'Réponse illisible d\'Async Herald Desktop.', code: 'invalid_output' };
  }
  if (!data || typeof data !== 'object') {
    return { error: 'Réponse vide d\'Async Herald Desktop.', code: 'invalid_output' };
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.error === 'string') {
    return { error: obj.error, code: typeof obj.code === 'string' ? obj.code : undefined };
  }
  if (typeof obj.version === 'number' && obj.version > REPORT_VERSION) {
    return {
      error: 'Cette version d\'Async Herald Desktop est plus récente que l\'extension : mettez l\'extension à jour.',
      code: 'version',
    };
  }
  if (typeof obj.score !== 'number' || !Array.isArray(obj.issues) || !Array.isArray(obj.categories)) {
    return { error: 'Rapport incomplet d\'Async Herald Desktop.', code: 'invalid_output' };
  }
  return obj as unknown as DesktopReport;
}

export function isDesktopError(value: DesktopReport | DesktopError): value is DesktopError {
  return typeof (value as DesktopError).error === 'string';
}

/** Compare deux versions « 0.2.0 » : négatif si a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

/** Ligne de progression écrite par l'app sur stderr : `PROGRESS <pourcentage> <message>`. */
export function parseProgressLine(line: string): { percent: number; message: string } | null {
  const match = /^PROGRESS\s+(\d{1,3})\s*(.*)$/.exec(line.trim());
  if (!match) {
    return null;
  }
  return { percent: Math.min(100, parseInt(match[1], 10)), message: match[2] };
}
