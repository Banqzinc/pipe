import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1774120945773 implements MigrationInterface {
    name = 'InitialSchema1774120945773'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "repo" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "github_owner" character varying NOT NULL, "github_name" character varying NOT NULL, "github_webhook_secret" character varying NOT NULL, "pat_token_encrypted" character varying NOT NULL, "auto_trigger_on_open" boolean NOT NULL DEFAULT false, "rule_paths" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f328cbf61542ecfd0f949e5d447" UNIQUE ("github_owner", "github_name"), CONSTRAINT "PK_6c3318a15f9a297481f341128cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."pull_request_status_enum" AS ENUM('open', 'closed', 'merged')`);
        await queryRunner.query(`CREATE TABLE "pull_request" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "repo_id" uuid NOT NULL, "github_pr_number" integer NOT NULL, "title" character varying NOT NULL, "author" character varying NOT NULL, "branch_name" character varying NOT NULL, "base_branch" character varying NOT NULL, "head_sha" character varying NOT NULL, "status" "public"."pull_request_status_enum" NOT NULL DEFAULT 'open', "linear_ticket_id" character varying, "notion_url" character varying, "stack_id" character varying, "stack_position" integer, "stack_size" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_072bfe9904460a2413dbe65bec7" UNIQUE ("repo_id", "github_pr_number"), CONSTRAINT "PK_2db8fa2766816707ba4a89ca9d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3ae15f54930a39fb7667f7ceeb" ON "pull_request" ("stack_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1da0bf8471cee2940109b2f45" ON "pull_request" ("repo_id", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."review_run_status_enum" AS ENUM('queued', 'running', 'completed', 'failed', 'partial')`);
        await queryRunner.query(`CREATE TABLE "review_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "pr_id" uuid NOT NULL, "head_sha" character varying NOT NULL, "status" "public"."review_run_status_enum" NOT NULL DEFAULT 'queued', "is_self_review" boolean NOT NULL DEFAULT false, "context_pack" jsonb, "toolkit_raw_output" text, "brief" jsonb, "risk_signals" jsonb, "error_message" text, "started_at" TIMESTAMP, "completed_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac4d68c861e634504ff4a469208" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f6689516d61f1a3e37712aff8a" ON "review_run" ("pr_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."finding_severity_enum" AS ENUM('critical', 'warning', 'suggestion', 'nitpick')`);
        await queryRunner.query(`CREATE TYPE "public"."finding_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'edited', 'posted')`);
        await queryRunner.query(`CREATE TABLE "finding" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "run_id" uuid NOT NULL, "file_path" character varying NOT NULL, "start_line" integer NOT NULL, "end_line" integer, "severity" "public"."finding_severity_enum" NOT NULL, "confidence" double precision NOT NULL, "category" character varying, "title" character varying NOT NULL, "body" text NOT NULL, "suggested_fix" text, "rule_ref" character varying, "status" "public"."finding_status_enum" NOT NULL DEFAULT 'pending', "edited_body" text, "toolkit_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a904dfcf401ccfbaa60bb6eec29" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cc507c48989382f67cf4ca3c84" ON "finding" ("run_id", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_ef8e2721e6be58268373108775" ON "finding" ("run_id", "toolkit_order") `);
        await queryRunner.query(`CREATE TABLE "review_post" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "run_id" uuid NOT NULL, "github_review_id" integer NOT NULL, "posted_sha" character varying NOT NULL, "findings_count" integer NOT NULL, "posted_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_de2990946b66f526e1f79d49e34" UNIQUE ("run_id"), CONSTRAINT "REL_de2990946b66f526e1f79d49e3" UNIQUE ("run_id"), CONSTRAINT "PK_3df2f1f5f615305b9cea2cc36ca" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "pull_request" ADD CONSTRAINT "FK_3870299527229b15e75a7a6381b" FOREIGN KEY ("repo_id") REFERENCES "repo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_run" ADD CONSTRAINT "FK_0feee0c6ce47eb3be926682b87e" FOREIGN KEY ("pr_id") REFERENCES "pull_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "finding" ADD CONSTRAINT "FK_86d89a3bdf98e2d04bfa0ec1e7b" FOREIGN KEY ("run_id") REFERENCES "review_run"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_post" ADD CONSTRAINT "FK_de2990946b66f526e1f79d49e34" FOREIGN KEY ("run_id") REFERENCES "review_run"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "review_post" DROP CONSTRAINT "FK_de2990946b66f526e1f79d49e34"`);
        await queryRunner.query(`ALTER TABLE "finding" DROP CONSTRAINT "FK_86d89a3bdf98e2d04bfa0ec1e7b"`);
        await queryRunner.query(`ALTER TABLE "review_run" DROP CONSTRAINT "FK_0feee0c6ce47eb3be926682b87e"`);
        await queryRunner.query(`ALTER TABLE "pull_request" DROP CONSTRAINT "FK_3870299527229b15e75a7a6381b"`);
        await queryRunner.query(`DROP TABLE "review_post"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ef8e2721e6be58268373108775"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cc507c48989382f67cf4ca3c84"`);
        await queryRunner.query(`DROP TABLE "finding"`);
        await queryRunner.query(`DROP TYPE "public"."finding_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."finding_severity_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f6689516d61f1a3e37712aff8a"`);
        await queryRunner.query(`DROP TABLE "review_run"`);
        await queryRunner.query(`DROP TYPE "public"."review_run_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e1da0bf8471cee2940109b2f45"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ae15f54930a39fb7667f7ceeb"`);
        await queryRunner.query(`DROP TABLE "pull_request"`);
        await queryRunner.query(`DROP TYPE "public"."pull_request_status_enum"`);
        await queryRunner.query(`DROP TABLE "repo"`);
    }

}
