import path from 'path';

export interface RiskSignal {
  name: string;
  level: 'high' | 'medium' | 'low';
  matched_paths: string[];
}

export interface RiskAnalysis {
  overall_risk: 'high' | 'medium' | 'low';
  signals: RiskSignal[];
}

/**
 * Pure, side-effect-free risk analysis.
 * Takes a list of changed file paths and a diff line count, returns risk analysis.
 */
export function analyzeRisk(changedFiles: string[], diffLineCount: number): RiskAnalysis {
  const signals: RiskSignal[] = [];

  // ── HIGH signals ─────────────────────────────────────────────────────────

  // Auth/tenant code
  const authPaths = changedFiles.filter((f) => /\/(auth|permissions|tenant)\//.test(f));
  if (authPaths.length > 0) {
    signals.push({ name: 'Auth/tenant code touched', level: 'high', matched_paths: authPaths });
  }

  // Schema changes — migration path OR .migration.ts extension
  const migrationPaths = changedFiles.filter(
    (f) => /\/migration\//.test(f) || f.endsWith('.migration.ts') || /\/migrations\//.test(f),
  );
  if (migrationPaths.length > 0) {
    signals.push({ name: 'Schema changes', level: 'high', matched_paths: migrationPaths });
  }

  // Money movement
  const moneyPaths = changedFiles.filter((f) => /\/(payout|refund|transaction)\//.test(f));
  if (moneyPaths.length > 0) {
    signals.push({ name: 'Money movement code', level: 'high', matched_paths: moneyPaths });
  }

  // ── MEDIUM signals ────────────────────────────────────────────────────────

  // Public API changed
  const apiPaths = changedFiles.filter((f) => /\/(routes|controllers)\//.test(f));
  if (apiPaths.length > 0) {
    signals.push({ name: 'Public API changed', level: 'medium', matched_paths: apiPaths });
  }

  // Third-party integration changed
  const integrationPaths = changedFiles.filter(
    (f) =>
      /\/(webhook|integration)\//.test(f) ||
      /Integration/.test(path.basename(f)) ||
      /Webhook/.test(path.basename(f)),
  );
  if (integrationPaths.length > 0) {
    signals.push({
      name: 'Third-party integration changed',
      level: 'medium',
      matched_paths: integrationPaths,
    });
  }

  // Logic changed without tests
  const missingTestPaths = findMissingTestFiles(changedFiles);
  if (missingTestPaths.length > 0) {
    signals.push({
      name: 'Logic changed without tests',
      level: 'medium',
      matched_paths: missingTestPaths,
    });
  }

  // Infrastructure changed (case-insensitive)
  const infraPaths = changedFiles.filter((f) =>
    /dockerfile|docker-compose|\.github\/|deploy|ci/i.test(f),
  );
  if (infraPaths.length > 0) {
    signals.push({ name: 'Infrastructure changed', level: 'medium', matched_paths: infraPaths });
  }

  // ── LOW signals ───────────────────────────────────────────────────────────

  // Large diff
  if (diffLineCount > 500) {
    signals.push({ name: 'Large diff', level: 'low', matched_paths: [] });
  }

  // ── Overall risk ──────────────────────────────────────────────────────────
  let overall_risk: 'high' | 'medium' | 'low' = 'low';
  if (signals.some((s) => s.level === 'high')) {
    overall_risk = 'high';
  } else if (signals.some((s) => s.level === 'medium')) {
    overall_risk = 'medium';
  }

  return { overall_risk, signals };
}

/**
 * For each .ts source file (excluding test/spec/declaration files and
 * __tests__/, migrations/, node_modules/ directories), check whether a
 * corresponding test file is present in changedFiles.
 *
 * Returns the list of source files that have no matching test file.
 */
function findMissingTestFiles(changedFiles: string[]): string[] {
  // Build a Set of all changed test-file basenames for fast lookup
  const testFileSet = new Set(changedFiles.filter(isTestFile).map((f) => path.basename(f)));
  const testFilePaths = changedFiles.filter(isTestFile);

  const missing: string[] = [];

  for (const file of changedFiles) {
    if (!isSourceFile(file)) continue;

    const baseName = path.basename(file, '.ts'); // e.g. "foo"

    // Check 1: same directory — foo.test.ts / foo.spec.ts
    const testName1 = `${baseName}.test.ts`;
    const testName2 = `${baseName}.spec.ts`;
    if (testFileSet.has(testName1) || testFileSet.has(testName2)) continue;

    // Check 2: any __tests__ path that contains the same base name as test or spec
    const matchedViaPath = testFilePaths.some((tf) => {
      const tfBase = path.basename(tf).replace(/\.(test|spec)\.ts$/, '');
      return tfBase === baseName;
    });
    if (matchedViaPath) continue;

    missing.push(file);
  }

  return missing;
}

/** Returns true if the file is a test/spec file */
function isTestFile(file: string): boolean {
  return file.endsWith('.test.ts') || file.endsWith('.spec.ts');
}

/**
 * Returns true if the file is a TypeScript source file that should have test
 * coverage (i.e. not a test file itself, not a declaration file, and not in
 * an excluded directory).
 */
function isSourceFile(file: string): boolean {
  if (!file.endsWith('.ts')) return false;
  if (file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.endsWith('.d.ts'))
    return false;

  const normalized = file.replace(/\\/g, '/');
  if (
    normalized.includes('/__tests__/') ||
    normalized.includes('/migrations/') ||
    normalized.includes('node_modules/')
  ) {
    return false;
  }

  return true;
}
