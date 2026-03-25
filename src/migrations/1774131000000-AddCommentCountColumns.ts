import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommentCountColumns1774131000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" ADD "github_comments" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "pull_request" ADD "github_review_comments" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" DROP COLUMN "github_review_comments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pull_request" DROP COLUMN "github_comments"`,
    );
  }
}
