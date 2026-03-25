import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStackReviewColumns1774129000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ReviewRun: add stack_id
    await queryRunner.query(
      `ALTER TABLE "review_run" ADD COLUMN "stack_id" varchar`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_review_run_stack_id" ON "review_run" ("stack_id")`,
    );

    // Finding: add pr_id with FK to pull_request
    await queryRunner.query(
      `ALTER TABLE "finding" ADD COLUMN "pr_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "finding" ADD CONSTRAINT "FK_finding_pr_id" FOREIGN KEY ("pr_id") REFERENCES "pull_request"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_finding_pr_id" ON "finding" ("pr_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_finding_pr_id"`);
    await queryRunner.query(
      `ALTER TABLE "finding" DROP CONSTRAINT "FK_finding_pr_id"`,
    );
    await queryRunner.query(`ALTER TABLE "finding" DROP COLUMN "pr_id"`);

    await queryRunner.query(`DROP INDEX "IDX_review_run_stack_id"`);
    await queryRunner.query(`ALTER TABLE "review_run" DROP COLUMN "stack_id"`);
  }
}
