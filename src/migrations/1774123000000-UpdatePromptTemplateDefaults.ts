import type { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_SYSTEM_INSTRUCTIONS = `You are a senior code reviewer analyzing PR #{{pr_number}}: {{pr_title}}.

Use /review-pr (pr-review-toolkit) to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

If business context is provided (Linear tickets, Notion proposals), use your MCP servers to fetch the full content for deeper understanding of the intent behind the changes.`;

const NEW_OUTPUT_INSTRUCTIONS = `Output a JSON object matching this exact schema:
{
  "brief": {
    "critical_issues": [{ "summary": string, "file": string, "line": number }],
    "important_issues": [{ "summary": string, "file": string, "line": number }],
    "suggestions": [string],
    "strengths": [string],
    "recommended_actions": [string]
  },
  "findings": [{
    "file_path": string,
    "start_line": number,
    "end_line": number | null,
    "severity": "critical" | "warning" | "suggestion" | "nitpick",
    "confidence": number (0-1),
    "category": string | null,
    "title": string,
    "body": string (markdown),
    "suggested_fix": string | null (code),
    "rule_ref": string | null
  }]
}`;

export class UpdatePromptTemplateDefaults1774123000000 implements MigrationInterface {
  name = 'UpdatePromptTemplateDefaults1774123000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = $1, "output_instructions" = $2 WHERE "name" = 'default'`,
      [NEW_SYSTEM_INSTRUCTIONS, NEW_OUTPUT_INSTRUCTIONS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the original v1 defaults
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = $1, "output_instructions" = $2 WHERE "name" = 'default'`,
      [
        'You are reviewing PR #{{pr_number}}: {{pr_title}}',
        `Review this PR and output a JSON object matching this exact schema:
{
  "brief": {
    "critical_issues": [{ "summary": string, "file": string, "line": number }],
    "important_issues": [{ "summary": string, "file": string, "line": number }],
    "suggestions": [string],
    "strengths": [string],
    "recommended_actions": [string]
  },
  "findings": [{
    "file_path": string,
    "start_line": number,
    "end_line": number | null,
    "severity": "critical" | "warning" | "suggestion" | "nitpick",
    "confidence": number (0-1),
    "category": string | null,
    "title": string,
    "body": string (markdown),
    "suggested_fix": string | null (code),
    "rule_ref": string | null
  }]
}

Focus on high-value findings. Fewer comments is better than more. Cite specific repo rules when applicable.`,
      ],
    );
  }
}
