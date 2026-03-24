import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewCompletedAtColumn1774128000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" ADD "review_completed_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" DROP COLUMN "review_completed_at"`,
    );
  }
}
