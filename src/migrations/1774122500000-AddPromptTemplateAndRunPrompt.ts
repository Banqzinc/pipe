import type { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SYSTEM_INSTRUCTIONS = `You are a senior code reviewer analyzing PR #{{pr_number}}: {{pr_title}}.

Use /review-pr to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

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

export class AddPromptTemplateAndRunPrompt1774122500000 implements MigrationInterface {
  name = 'AddPromptTemplateAndRunPrompt1774122500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create prompt_template table
    await queryRunner.query(`
      CREATE TABLE "prompt_template" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL DEFAULT 'default',
        "system_instructions" text NOT NULL,
        "output_instructions" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prompt_template" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prompt_template_name" UNIQUE ("name")
      )
    `);

    // Insert default template
    await queryRunner.query(
      `INSERT INTO "prompt_template" ("name", "system_instructions", "output_instructions") VALUES ($1, $2, $3)`,
      ['default', DEFAULT_SYSTEM_INSTRUCTIONS, DEFAULT_OUTPUT_INSTRUCTIONS],
    );

    // Add prompt column to review_run
    await queryRunner.query(
      `ALTER TABLE "review_run" ADD "prompt" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "review_run" DROP COLUMN "prompt"`);
    await queryRunner.query(`DROP TABLE "prompt_template"`);
  }
}
