import type { MigrationInterface, QueryRunner } from 'typeorm';

const UPDATED_OUTPUT_INSTRUCTIONS = `Output a JSON object matching this exact schema:
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
  }],
  "architecture": {
    "summary": string (2-3 sentences on the architectural impact of these changes),
    "patterns": [{
      "name": string (pattern name, e.g. "Repository Pattern", "Service Layer"),
      "description": string (how this PR uses or affects the pattern),
      "assessment": "good" | "mixed" | "problematic"
    }],
    "concerns": [{
      "title": string,
      "severity": "high" | "medium" | "low",
      "description": string (markdown explanation of the concern),
      "affected_files": [string]
    }],
    "module_diagram": string | null (Mermaid graph TD showing module dependencies for changed files — highlight coupling concerns with red styling, keep it focused on the PR scope)
  }
}

For the architecture field: assess separation of concerns, coupling between modules, layering violations (e.g. routes bypassing services), abstraction quality, and whether the changes fit the existing codebase patterns. Generate a Mermaid dependency diagram showing how the changed files relate to each other and their key dependencies.`;

export class AddArchitectureReview1774210000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add architecture_review column
    await queryRunner.query(
      `ALTER TABLE "review_run" ADD "architecture_review" jsonb`,
    );

    // 2. Update prompt template output_format section and legacy output_instructions
    const templates = await queryRunner.query(
      `SELECT id, sections, output_instructions FROM prompt_template`,
    );

    for (const t of templates) {
      // Update legacy field
      await queryRunner.query(
        `UPDATE prompt_template SET output_instructions = $1 WHERE id = $2`,
        [UPDATED_OUTPUT_INSTRUCTIONS, t.id],
      );

      // Update sections if they exist
      if (t.sections) {
        const sections = typeof t.sections === 'string'
          ? JSON.parse(t.sections)
          : t.sections;

        const outputSection = sections.find(
          (s: { key: string }) => s.key === 'output_format',
        );
        if (outputSection) {
          outputSection.content = UPDATED_OUTPUT_INSTRUCTIONS;
        }

        await queryRunner.query(
          `UPDATE prompt_template SET sections = $1 WHERE id = $2`,
          [JSON.stringify(sections), t.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review_run" DROP COLUMN "architecture_review"`,
    );
  }
}
