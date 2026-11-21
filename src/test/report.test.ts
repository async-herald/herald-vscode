import * as assert from 'assert';
import {
  compareVersions,
  isDesktopError,
  parseDesktopOutput,
  parseProgressLine,
} from '../report';

suite('Rapport d\'Async Herald Desktop', () => {
  test('lit un rapport complet', () => {
    const report = parseDesktopOutput(JSON.stringify({
      version: 1,
      project: 'Cutctus',
      path: '/tmp/cutctus',
      analyzedAt: '2026-11-21T14:02:00Z',
      durationMs: 2400,
      score: 95,
      grade: 'A',
      files: 20,
      categories: [{ id: 'quality', label: 'Qualité', score: 96, grade: 'A', applicable: true }],
      issues: [{ rule: 'long-line', title: 'Ligne trop longue', severity: 'warning', category: 'quality', file: 'src/a.ts', line: 3 }],
    }));
    assert.ok(!isDesktopError(report));
    assert.strictEqual(report.score, 95);
    assert.strictEqual(report.issues.length, 1);
  });

  test('rend les erreurs de l\'app telles quelles', () => {
    const result = parseDesktopOutput('{"error":"Connectez-vous dans l\'app.","code":"not_signed_in"}');
    assert.ok(isDesktopError(result));
    assert.strictEqual(result.code, 'not_signed_in');
  });

  test('refuse une sortie illisible ou un format plus récent', () => {
    const garbage = parseDesktopOutput('Async Herald 0.1.9');
    assert.ok(isDesktopError(garbage));
    assert.strictEqual(garbage.code, 'invalid_output');
    const newer = parseDesktopOutput('{"version":2,"score":90,"issues":[],"categories":[]}');
    assert.ok(isDesktopError(newer));
    assert.strictEqual(newer.code, 'version');
  });

  test('compare les versions de l\'app', () => {
    assert.ok(compareVersions('0.1.9', '0.2.0') < 0);
    assert.strictEqual(compareVersions('0.2.0', '0.2.0'), 0);
    assert.ok(compareVersions('0.10.0', '0.2.0') > 0);
  });

  test('lit les lignes de progression', () => {
    assert.deepStrictEqual(parseProgressLine('PROGRESS 42 Analyse des fichiers · 11 / 20'), {
      percent: 42,
      message: 'Analyse des fichiers · 11 / 20',
    });
    assert.strictEqual(parseProgressLine('warning: something'), null);
  });
});
