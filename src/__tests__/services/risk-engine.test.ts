import { describe, it, expect } from 'vitest';
import { analyzeRisk } from '../../services/risk-engine';

describe('analyzeRisk', () => {
  // HIGH signals

  it('detects auth code changes', () => {
    const result = analyzeRisk(['src/entities/auth/AuthSession.entity.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Auth/tenant code touched', level: 'high' }),
    );
  });

  it('detects tenant code changes', () => {
    const result = analyzeRisk(['src/services/tenant/tenantService.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Auth/tenant code touched', level: 'high' }),
    );
  });

  it('detects permissions code changes', () => {
    const result = analyzeRisk(['src/middleware/permissions/checkRole.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Auth/tenant code touched', level: 'high' }),
    );
  });

  it('detects migration changes via path', () => {
    const result = analyzeRisk(['src/migrations/1234-AddTable.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Schema changes', level: 'high' }),
    );
  });

  it('detects migration changes via file extension', () => {
    const result = analyzeRisk(['src/db/AddUsers.migration.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Schema changes', level: 'high' }),
    );
  });

  it('detects money movement code — payout', () => {
    const result = analyzeRisk(['src/services/payout/payoutService.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Money movement code', level: 'high' }),
    );
  });

  it('detects money movement code — refund', () => {
    const result = analyzeRisk(['src/services/refund/refundHandler.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Money movement code', level: 'high' }),
    );
  });

  it('detects money movement code — transaction', () => {
    const result = analyzeRisk(['src/services/transaction/processTransaction.ts'], 50);
    expect(result.overall_risk).toBe('high');
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Money movement code', level: 'high' }),
    );
  });

  // MEDIUM signals

  it('detects public API changes via routes', () => {
    const result = analyzeRisk(['src/routes/payoutRoutes.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Public API changed', level: 'medium' }),
    );
  });

  it('detects public API changes via controllers', () => {
    const result = analyzeRisk(['src/controllers/userController.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Public API changed', level: 'medium' }),
    );
  });

  it('detects third-party integration changes via webhook path', () => {
    const result = analyzeRisk(['src/services/webhook/stripeWebhook.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Third-party integration changed', level: 'medium' }),
    );
  });

  it('detects third-party integration changes via integration path', () => {
    const result = analyzeRisk(['src/services/integration/slackIntegration.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Third-party integration changed', level: 'medium' }),
    );
  });

  it('detects third-party integration changes via *Integration* filename', () => {
    const result = analyzeRisk(['src/services/SlackIntegration.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Third-party integration changed', level: 'medium' }),
    );
  });

  it('detects third-party integration changes via *Webhook* filename', () => {
    const result = analyzeRisk(['src/handlers/StripeWebhook.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Third-party integration changed', level: 'medium' }),
    );
  });

  it('detects logic without tests', () => {
    const result = analyzeRisk(['src/services/foo.ts'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Logic changed without tests', level: 'medium' }),
    );
  });

  it('does not flag missing tests when matching .test.ts file is present', () => {
    const result = analyzeRisk(
      ['src/services/foo.ts', 'src/__tests__/services/foo.test.ts'],
      50,
    );
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('does not flag missing tests when matching .spec.ts file is present', () => {
    const result = analyzeRisk(['src/services/bar.ts', 'src/services/bar.spec.ts'], 50);
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('does not flag test files themselves as missing tests', () => {
    const result = analyzeRisk(['src/__tests__/services/foo.test.ts'], 50);
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('does not flag .d.ts files as missing tests', () => {
    const result = analyzeRisk(['src/types/global.d.ts'], 50);
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('does not flag migration files as missing tests', () => {
    const result = analyzeRisk(['src/migrations/1234-AddTable.ts'], 50);
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('does not flag node_modules files as missing tests', () => {
    const result = analyzeRisk(['node_modules/some-lib/index.ts'], 50);
    const testSignal = result.signals.find((s) => s.name === 'Logic changed without tests');
    expect(testSignal).toBeUndefined();
  });

  it('detects infrastructure changes — Dockerfile', () => {
    const result = analyzeRisk(['Dockerfile', '.github/workflows/deploy.yml'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Infrastructure changed', level: 'medium' }),
    );
  });

  it('detects infrastructure changes — docker-compose', () => {
    const result = analyzeRisk(['docker-compose.yml'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Infrastructure changed', level: 'medium' }),
    );
  });

  it('detects infrastructure changes — .github/', () => {
    const result = analyzeRisk(['.github/workflows/ci.yml'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Infrastructure changed', level: 'medium' }),
    );
  });

  it('detects infrastructure changes — deploy path (case-insensitive)', () => {
    const result = analyzeRisk(['scripts/Deploy.sh'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Infrastructure changed', level: 'medium' }),
    );
  });

  it('detects infrastructure changes — ci path (case-insensitive)', () => {
    const result = analyzeRisk(['CI/pipeline.yml'], 50);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Infrastructure changed', level: 'medium' }),
    );
  });

  // LOW signals

  it('detects large diffs', () => {
    const result = analyzeRisk(['src/foo.ts'], 600);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Large diff', level: 'low' }),
    );
  });

  it('does not flag large diff when diffLineCount is exactly 500', () => {
    const result = analyzeRisk(['README.md'], 500);
    const largeDiffSignal = result.signals.find((s) => s.name === 'Large diff');
    expect(largeDiffSignal).toBeUndefined();
  });

  it('flags large diff when diffLineCount is 501', () => {
    const result = analyzeRisk(['README.md'], 501);
    expect(result.signals).toContainEqual(
      expect.objectContaining({ name: 'Large diff', level: 'low' }),
    );
  });

  // Overall risk computation

  it('returns low when no signals fire', () => {
    const result = analyzeRisk(['README.md'], 50);
    expect(result.overall_risk).toBe('low');
    expect(result.signals).toHaveLength(0);
  });

  it('returns medium when only medium signals fire', () => {
    const result = analyzeRisk(['src/routes/healthcheck.ts'], 50);
    expect(result.overall_risk).toBe('medium');
  });

  it('returns low for large diff alone (no medium/high)', () => {
    const result = analyzeRisk(['README.md'], 600);
    expect(result.overall_risk).toBe('low');
  });

  it('multiple signals accumulate', () => {
    const result = analyzeRisk(
      ['src/entities/auth/session.ts', 'src/migrations/001.ts', 'src/routes/auth.ts'],
      600,
    );
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
    expect(result.overall_risk).toBe('high');
  });

  it('high signal overrides medium signals', () => {
    const result = analyzeRisk(['src/routes/auth.ts', 'src/services/payout/pay.ts'], 50);
    expect(result.overall_risk).toBe('high');
  });

  it('matched_paths contains only the files that triggered the signal', () => {
    const result = analyzeRisk(
      ['src/entities/auth/session.ts', 'src/services/foo.ts'],
      50,
    );
    const authSignal = result.signals.find((s) => s.name === 'Auth/tenant code touched');
    expect(authSignal?.matched_paths).toEqual(['src/entities/auth/session.ts']);
  });
});
