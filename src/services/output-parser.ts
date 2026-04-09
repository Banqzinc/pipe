import { jsonrepair } from 'jsonrepair';
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
  pr_number: z.number().nullable().default(null),
});

const ArchPatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  assessment: z.enum(['good', 'mixed', 'problematic']),
});

const ArchConcernSchema = z.object({
  title: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  description: z.string(),
  affected_files: z.array(z.string()).default([]),
});

const ArchitectureReviewSchema = z.object({
  summary: z.string(),
  patterns: z.array(ArchPatternSchema).default([]),
  concerns: z.array(ArchConcernSchema).default([]),
  module_diagram: z.string().nullable().default(null),
});

const ToolkitOutputSchema = z.object({
  brief: BriefSchema,
  findings: z.array(FindingSchema),
  architecture: ArchitectureReviewSchema.optional(),
});

// --- Types ---

export type Brief = z.infer<typeof BriefSchema>;
export type ParsedFinding = z.infer<typeof FindingSchema>;
export type ArchitectureReview = z.infer<typeof ArchitectureReviewSchema>;
export type ToolkitOutput = z.infer<typeof ToolkitOutputSchema>;

export interface ParseResult {
  brief: Brief | null;
  findings: ParsedFinding[];
  architecture: ArchitectureReview | null;
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

// --- JSON Repair for LLM output ---

/**
 * Repair unescaped double quotes inside JSON string values.
 * LLMs occasionally produce JSON like: "body": "he said "hello" to her"
 * where the inner quotes break JSON.parse. This function escapes them.
 *
 * Strategy: walk character by character, track whether we're inside a JSON
 * string. When we see a `"` that closes a string, check if the next non-space
 * character is a valid JSON structure char (`:`, `,`, `}`, `]`). If not,
 * it's an unescaped interior quote — escape it and continue.
 */
function repairLlmJson(text: string): string {
  const chars = [...text];
  const result: string[] = [];
  let inString = false;
  let i = 0;

  while (i < chars.length) {
    const c = chars[i];

    if (!inString) {
      result.push(c);
      if (c === '"') inString = true;
      i++;
      continue;
    }

    // We're inside a string
    if (c === '\\') {
      // Escaped character — push both and skip
      result.push(c);
      if (i + 1 < chars.length) {
        result.push(chars[i + 1]);
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (c === '"') {
      // Is this the real end of the string, or an unescaped interior quote?
      // Look ahead: skip whitespace, then check if next char is a JSON structural char
      let j = i + 1;
      while (j < chars.length && (chars[j] === ' ' || chars[j] === '\t')) j++;
      const next = j < chars.length ? chars[j] : '';

      // Valid string terminators: the char after the quote (after optional space) should be
      // `,` (next field), `}` (end object), `]` (end array), `:` (was a key), or newline before those
      if (next === ',' || next === '}' || next === ']' || next === ':' || next === '\n' || next === '\r' || next === '') {
        // If next is newline, peek further to confirm it's structural
        if (next === '\n' || next === '\r') {
          let k = j;
          while (k < chars.length && (chars[k] === '\n' || chars[k] === '\r' || chars[k] === ' ' || chars[k] === '\t')) k++;
          const afterNewline = k < chars.length ? chars[k] : '';
          if (afterNewline === ',' || afterNewline === '}' || afterNewline === ']' || afterNewline === '"' || afterNewline === '') {
            // Real end of string
            result.push(c);
            inString = false;
            i++;
            continue;
          }
          // Not structural after newline — it's an interior quote
          result.push('\\', '"');
          i++;
          continue;
        }

        // Real end of string
        result.push(c);
        inString = false;
        i++;
        continue;
      }

      // Not followed by a structural char — this is an unescaped interior quote
      result.push('\\', '"');
      i++;
      continue;
    }

    // Regular character inside string
    result.push(c);
    i++;
  }

  return result.join('');
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
      architecture: null,
      rawOutput: rawJson,
      parseErrors: ['Invalid JSON'],
      isPartial: false,
    };
  }

  // Step 1b: Unwrap Claude CLI --output-format stream-json / json envelope
  // The CLI wraps responses as {"type":"result","result":"<content string>"}
  // With extended thinking, result may be an array of content blocks:
  //   [{"type":"thinking","thinking":"..."}, {"type":"text","text":"..."}]
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in (parsed as any) &&
    (parsed as any).type === 'result' &&
    'result' in (parsed as any)
  ) {
    let inner: string;

    const resultField = (parsed as any).result;
    if (typeof resultField === 'string') {
      inner = resultField;
    } else if (Array.isArray(resultField)) {
      // Extended thinking: extract text from content blocks
      const textBlock = resultField.find(
        (block: any) => block.type === 'text' && typeof block.text === 'string',
      );
      inner = textBlock?.text ?? '';
    } else {
      inner = '';
    }

    if (inner) {
      let innerParsed = false;

      // Try parsing as-is first (model returned pure JSON)
      try {
        parsed = JSON.parse(inner);
        innerParsed = true;
      } catch {
        // Strip markdown code fences if present.
        // Use greedy match to handle embedded code fences inside JSON string values.
        const fenceMatch = inner.match(/```(?:json)?\s*\n([\s\S]+)\n```/);
        const jsonText = fenceMatch ? fenceMatch[1].trim() : inner;

        // Try strict parse, then repair unescaped quotes, then jsonrepair
        try {
          parsed = JSON.parse(jsonText);
          innerParsed = true;
        } catch {
          // Repair unescaped quotes in LLM output (e.g. "he said "hello" to her")
          const repaired = repairLlmJson(jsonText);
          try {
            parsed = JSON.parse(repaired);
            innerParsed = true;
          } catch {
            try {
              parsed = JSON.parse(jsonrepair(repaired));
              innerParsed = true;
            } catch {
              // All repair attempts failed — try regex extraction as last resort
            }
          }
        }

        // Fallback: extract JSON object from raw text by matching outermost { ... }
        if (!innerParsed) {
          const jsonMatch = inner.match(/\{[\s\S]*"brief"[\s\S]*"findings"[\s\S]*\}/);
          if (jsonMatch) {
            const repairedMatch = repairLlmJson(jsonMatch[0]);
            try {
              parsed = JSON.parse(repairedMatch);
              innerParsed = true;
            } catch {
              try {
                parsed = JSON.parse(jsonrepair(repairedMatch));
                innerParsed = true;
              } catch {
                return {
                  brief: null,
                  findings: [],
                  architecture: null,
                  rawOutput: rawJson,
                  parseErrors: ['Failed to parse inner result JSON from CLI envelope'],
                  isPartial: false,
                };
              }
            }
          } else {
            return {
              brief: null,
              findings: [],
              architecture: null,
              rawOutput: rawJson,
              parseErrors: ['Failed to parse inner result JSON from CLI envelope'],
              isPartial: false,
            };
          }
        }
      }
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
      architecture: fullResult.data.architecture ?? null,
      rawOutput: rawJson,
      parseErrors: [],
      isPartial: false,
    };
  }

  // Step 4: Partial failure — try parsing brief and findings separately
  const parseErrors: string[] = [];
  let brief: Brief | null = null;
  let findings: ParsedFinding[] = [];
  let architecture: ArchitectureReview | null = null;
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

  // Try parsing architecture (optional — old outputs won't have it)
  if (obj && typeof obj === 'object' && 'architecture' in obj) {
    const archResult = ArchitectureReviewSchema.safeParse(obj.architecture);
    if (archResult.success) {
      architecture = archResult.data;
      hasAnySuccess = true;
    } else {
      parseErrors.push(`Architecture validation failed: ${archResult.error.message}`);
    }
  }

  return {
    brief,
    findings,
    architecture,
    rawOutput: rawJson,
    parseErrors,
    isPartial: hasAnySuccess,
  };
}
