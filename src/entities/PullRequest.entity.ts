import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { PrStatus } from './enums';
import { Repo } from './Repo.entity';
import { ReviewRun } from './ReviewRun.entity';

@Entity()
@Unique(['repo_id', 'github_pr_number'])
@Index(['repo_id', 'status'])
@Index(['stack_id'])
export class PullRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false })
  repo_id!: string;

  @Column({ type: 'int', nullable: false })
  github_pr_number!: number;

  @Column({ type: 'varchar', nullable: false })
  title!: string;

  @Column({ type: 'varchar', nullable: false })
  author!: string;

  @Column({ type: 'varchar', nullable: false })
  branch_name!: string;

  @Column({ type: 'varchar', nullable: false })
  base_branch!: string;

  @Column({ type: 'varchar', nullable: false })
  head_sha!: string;

  @Column({ type: 'enum', enum: PrStatus, default: PrStatus.Open })
  status!: PrStatus;

  @Column({ type: 'boolean', default: false })
  is_draft!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  github_updated_at!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  linear_ticket_id!: string | null;

  @Column({ type: 'varchar', nullable: true })
  notion_url!: string | null;

  @Column({ type: 'varchar', nullable: true })
  stack_id!: string | null;

  @Column({ type: 'int', nullable: true })
  stack_position!: number | null;

  @Column({ type: 'int', nullable: true })
  stack_size!: number | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => Repo,
    (repo) => repo.pullRequests,
  )
  @JoinColumn({ name: 'repo_id' })
  repo!: Repo;

  @OneToMany(
    () => ReviewRun,
    (run) => run.pullRequest,
  )
  reviewRuns!: ReviewRun[];
}
