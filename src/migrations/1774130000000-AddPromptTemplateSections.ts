import type { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SYSTEM_INSTRUCTIONS = `You are a senior code reviewer analyzing PR #{{pr_number}}: {{pr_title}}.

Use /review-pr (pr-review-toolkit) to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

If business context is provided (Linear tickets, Notion proposals), use your MCP servers to fetch the full content for deeper understanding of the intent behind the changes.`;

const DEFAULT_OUTPUT_INSTRUCTIONS = `Output a JSON object matching this exact schema:
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

export class AddPromptTemplateSections1774130000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prompt_template" ADD COLUMN "sections" jsonb`,
    );

    // Populate default sections from existing system_instructions / output_instructions
    const templates = await queryRunner.query(
      `SELECT id, system_instructions, output_instructions FROM prompt_template`,
    );

    for (const t of templates) {
      const sections = [
        {
          key: 'review_instructions',
          name: 'Review Instructions',
          description: 'Prepended to every review prompt. Use {{pr_number}} and {{pr_title}} as placeholders.',
          enabled: true,
          content: t.system_instructions || DEFAULT_SYSTEM_INSTRUCTIONS,
          editable: true,
          system: false,
        },
        {
          key: 'rule_discovery',
          name: 'Project Rules (CLAUDE.md, AGENTS.md)',
          description: 'When enabled, the reviewer reads and applies project rule files found in the repository.',
          enabled: true,
          content: '',
          editable: false,
          system: true,
        },
        {
          key: 'pr_metadata',
          name: 'PR Metadata',
          description: 'Branch info, stack position, and other PR metadata. Auto-generated at run time.',
          enabled: true,
          content: '',
          editable: false,
          system: true,
        },
        {
          key: 'business_context',
          name: 'Business Context (Linear, Notion)',
          description: 'Includes linked Linear ticket IDs and Notion proposal URLs. Auto-generated at run time.',
          enabled: true,
          content: '',
          editable: false,
          system: true,
        },
        {
          key: 'prior_comments',
          name: 'Prior Review Comments',
          description: 'Includes prior review comment threads for follow-up context. Auto-generated at run time.',
          enabled: true,
          content: '',
          editable: false,
          system: true,
        },
        {
          key: 'output_format',
          name: 'Output Format',
          description: 'Defines the expected JSON output schema for findings and brief.',
          enabled: true,
          content: t.output_instructions || DEFAULT_OUTPUT_INSTRUCTIONS,
          editable: true,
          system: false,
        },
      ];

      await queryRunner.query(
        `UPDATE prompt_template SET sections = $1 WHERE id = $2`,
        [JSON.stringify(sections), t.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prompt_template" DROP COLUMN "sections"`,
    );
  }
}
