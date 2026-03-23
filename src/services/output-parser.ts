import { z } from 'zod';

// --- Zod Schemas ---

const BriefSchema = z.object({
  critical_issues: z.array(z.object({ summary: z.string(), file: z.string(), line: z.number() })).default([]),
  important_issues: z.array(z.object({ summary: z.string(), file: z.string(), line: z.number() })).default([]),
  suggestions: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  recommended_actions: z.array(z.string()).default([]),
});

const FindingSchema = z.object({
  file_path: z.string(),
  start_line: z.number(),
  end_line: z.number().nullable().default(null),
  severity: z.enum(['critical', 'warning', 'suggestion', 'nitpick']),
  confidence: z.number().min(0).max(1),
  category: z.string().nullable().default(null),
  title: z.string(),
  body: z.string(),
  suggested_fix: z.string().nullable().default(null),
  rule_ref: z.string().nullable().default(null),
});

const ToolkitOutputSchema = z.object({
  brief: BriefSchema,
  findings: z.array(FindingSchema),
});

// --- Types ---

export type Brief = z.infer<typeof BriefSchema>;
export type ParsedFinding = z.infer<typeof FindingSchema>;
export type ToolkitOutput = z.infer<typeof ToolkitOutputSchema>;

export interface ParseResult {
  brief: Brief | null;
  findings: ParsedFinding[];
  rawOutput: string;
  parseErrors: string[];
  isPartial: boolean;
}

// --- Deduplication ---

function deduplicateFindings(findings: ParsedFinding[]): ParsedFinding[] {
  const seen = new Set<string>();
  const result: ParsedFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.file_path}::${finding.start_line}::${finding.body}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(finding);
    }
  }

  return result;
}

// --- Parser ---

export function parseToolkitOutput(rawJson: string): ParseResult {
  // Step 1: Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      brief: null,
      findings: [],
      rawOutput: rawJson,
      parseErrors: ['Invalid JSON'],
      isPartial: false,
    };
  }

  // Step 1b: Unwrap Claude CLI --output-format json envelope
  // The CLI wraps responses as {"type":"result","result":"<content string>"}
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in (parsed as any) &&
    (parsed as any).type === 'result' &&
    'result' in (parsed as any) &&
    typeof (parsed as any).result === 'string'
  ) {
    let inner = (parsed as any).result as string;
    // Strip markdown code fences if present
    const fenceMatch = inner.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      inner = fenceMatch[1].trim();
    }
    try {
      parsed = JSON.parse(inner);
    } catch {
      return {
        brief: null,
        findings: [],
        rawOutput: rawJson,
        parseErrors: ['Failed to parse inner result JSON from CLI envelope'],
        isPartial: false,
      };
    }
  }

  // Step 2: Validate with full schema
  const fullResult = ToolkitOutputSchema.safeParse(parsed);

  if (fullResult.success) {
    // Step 3: Full success — deduplicate findings
    const findings = deduplicateFindings(fullResult.data.findings);
    return {
      brief: fullResult.data.brief,
      findings,
      rawOutput: rawJson,
      parseErrors: [],
      isPartial: false,
    };
  }

  // Step 4: Partial failure — try parsing brief and findings separately
  const parseErrors: string[] = [];
  let brief: Brief | null = null;
  let findings: ParsedFinding[] = [];
  let hasAnySuccess = false;

  const obj = parsed as Record<string, unknown>;

  // Try parsing brief
  if (obj && typeof obj === 'object' && 'brief' in obj) {
    const briefResult = BriefSchema.safeParse(obj.brief);
    if (briefResult.success) {
      brief = briefResult.data;
      hasAnySuccess = true;
    } else {
      parseErrors.push(`Brief validation failed: ${briefResult.error.message}`);
    }
  } else {
    parseErrors.push('Missing brief field');
  }

  // Try parsing findings
  if (obj && typeof obj === 'object' && 'findings' in obj && Array.isArray(obj.findings)) {
    const validFindings: ParsedFinding[] = [];
    let hasInvalidFinding = false;

    for (const item of obj.findings) {
      const findingResult = FindingSchema.safeParse(item);
      if (findingResult.success) {
        validFindings.push(findingResult.data);
      } else {
        hasInvalidFinding = true;
      }
    }

    if (hasInvalidFinding) {
      parseErrors.push('Some findings failed validation');
    }

    if (validFindings.length > 0) {
      hasAnySuccess = true;
    }

    findings = deduplicateFindings(validFindings);
  } else {
    parseErrors.push('Missing or invalid findings field');
  }

  return {
    brief,
    findings,
    rawOutput: rawJson,
    parseErrors,
    isPartial: hasAnySuccess,
  };
}
