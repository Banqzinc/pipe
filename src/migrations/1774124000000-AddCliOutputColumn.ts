import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCliOutputColumn1774124000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "review_run" ADD "cli_output" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "review_run" DROP COLUMN "cli_output"`);
  }
}
