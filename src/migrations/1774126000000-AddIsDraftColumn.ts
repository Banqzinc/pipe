import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsDraftColumn1774126000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" ADD "is_draft" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pull_request" DROP COLUMN "is_draft"`,
    );
  }
}
