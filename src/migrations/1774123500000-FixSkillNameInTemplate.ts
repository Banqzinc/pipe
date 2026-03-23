import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSkillNameInTemplate1774123500000 implements MigrationInterface {
  name = 'FixSkillNameInTemplate1774123500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = REPLACE("system_instructions", 'Use /review-pr to review', 'Use /review-pr (pr-review-toolkit) to review') WHERE "system_instructions" LIKE '%Use /review-pr to review%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = REPLACE("system_instructions", 'Use /review-pr (pr-review-toolkit) to review', 'Use /review-pr to review') WHERE "system_instructions" LIKE '%pr-review-toolkit%'`,
    );
  }
}
