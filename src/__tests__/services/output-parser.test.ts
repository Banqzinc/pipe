import { describe, it, expect } from 'vitest';
import { parseToolkitOutput } from '../../services/output-parser';

describe('parseToolkitOutput', () => {
  it('parses valid complete output', () => {
    const output = JSON.stringify({
      brief: {
        critical_issues: [{ summary: 'DB write outside tx', file: 'svc.ts', line: 47 }],
        important_issues: [],
        suggestions: ['Add rate limiting'],
        strengths: ['Clean separation'],
        recommended_actions: ['Review tx scope'],
      },
      findings: [{
        file_path: 'src/service.ts',
        start_line: 47,
        end_line: null,
        severity: 'critical',
        confidence: 0.92,
        category: 'security',
        title: 'DB write outside transaction',
        body: 'The write at line 47 is outside the transaction scope.',
        suggested_fix: 'Move inside transaction callback',
        rule_ref: 'quidkey-core-security',
      }],
    });
    const result = parseToolkitOutput(output);
    expect(result.brief).not.toBeNull();
    expect(result.findings).toHaveLength(1);
    expect(result.parseErrors).toHaveLength(0);
    expect(result.isPartial).toBe(false);
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseToolkitOutput('not json at all');
    expect(result.brief).toBeNull();
    expect(result.findings).toHaveLength(0);
    expect(result.parseErrors).toContain('Invalid JSON');
  });

  it('handles partial output (valid brief, invalid findings)', () => {
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [{ invalid: true }],  // missing required fields
    });
    const result = parseToolkitOutput(output);
    expect(result.brief).not.toBeNull();
    expect(result.isPartial).toBe(true);
  });

  it('deduplicates exact findings', () => {
    const finding = {
      file_path: 'src/a.ts', start_line: 10, end_line: null,
      severity: 'warning', confidence: 0.8, category: null,
      title: 'Dup', body: 'Same issue', suggested_fix: null, rule_ref: null,
    };
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [finding, finding],  // exact duplicate
    });
    const result = parseToolkitOutput(output);
    expect(result.findings).toHaveLength(1);
  });

  it('handles empty findings array', () => {
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [],
    });
    const result = parseToolkitOutput(output);
    expect(result.findings).toHaveLength(0);
    expect(result.isPartial).toBe(false);
  });

  it('preserves rawOutput in all cases', () => {
    const raw = 'some raw string';
    const result = parseToolkitOutput(raw);
    expect(result.rawOutput).toBe(raw);
  });

  it('returns defaults for brief fields that are missing', () => {
    const output = JSON.stringify({
      brief: {},
      findings: [],
    });
    const result = parseToolkitOutput(output);
    expect(result.brief).not.toBeNull();
    expect(result.brief!.critical_issues).toEqual([]);
    expect(result.brief!.suggestions).toEqual([]);
    expect(result.isPartial).toBe(false);
  });

  it('returns defaults for finding fields with nullable defaults', () => {
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [{
        file_path: 'src/a.ts',
        start_line: 1,
        severity: 'warning',
        confidence: 0.5,
        title: 'Test',
        body: 'Test body',
      }],
    });
    const result = parseToolkitOutput(output);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].end_line).toBeNull();
    expect(result.findings[0].category).toBeNull();
    expect(result.findings[0].suggested_fix).toBeNull();
    expect(result.findings[0].rule_ref).toBeNull();
    expect(result.isPartial).toBe(false);
  });

  it('does not deduplicate findings with different bodies', () => {
    const finding1 = {
      file_path: 'src/a.ts', start_line: 10, end_line: null,
      severity: 'warning' as const, confidence: 0.8, category: null,
      title: 'Issue A', body: 'First issue', suggested_fix: null, rule_ref: null,
    };
    const finding2 = {
      ...finding1,
      body: 'Different issue',
    };
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [finding1, finding2],
    });
    const result = parseToolkitOutput(output);
    expect(result.findings).toHaveLength(2);
  });

  it('handles valid brief with completely missing findings key', () => {
    const output = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
    });
    const result = parseToolkitOutput(output);
    expect(result.brief).not.toBeNull();
    expect(result.isPartial).toBe(true);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  it('parses CLI result envelope with embedded code fences in finding body', () => {
    const reviewJson = JSON.stringify({
      brief: { critical_issues: [], important_issues: [], suggestions: [], strengths: [], recommended_actions: [] },
      findings: [{
        file_path: 'docker-compose.yml',
        start_line: 10,
        end_line: null,
        severity: 'suggestion',
        confidence: 0.8,
        category: 'ops',
        title: 'Add healthcheck',
        body: 'Add a healthcheck:\n\n```yaml\nhealthcheck:\n  test: ["CMD", "pg_isready"]\n```\n\nThis ensures readiness.',
        suggested_fix: null,
        rule_ref: null,
      }],
    });
    const cliOutput = JSON.stringify({
      type: 'result',
      result: `Here is my review:\n\n\`\`\`json\n${reviewJson}\n\`\`\``,
    });
    const result = parseToolkitOutput(cliOutput);
    expect(result.parseErrors).toHaveLength(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe('Add healthcheck');
  });
});
