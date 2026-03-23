import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGithubUpdatedAtColumn1774127000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" ADD "github_updated_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" DROP COLUMN "github_updated_at"`,
    );
  }
}
