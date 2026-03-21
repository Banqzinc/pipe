import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewRunUpdatedAt1774121667473 implements MigrationInterface {
    name = 'AddReviewRunUpdatedAt1774121667473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "review_run" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "review_run" DROP COLUMN "updated_at"`);
    }

}
