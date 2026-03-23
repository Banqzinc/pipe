import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeGithubReviewIdToBigint1774125000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review_post" ALTER COLUMN "github_review_id" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "review_post" ALTER COLUMN "github_review_id" TYPE integer`,
    );
  }
}
