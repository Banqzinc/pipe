import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { RunStatus } from './enums';
import type { PullRequest } from './PullRequest.entity';
import type { Finding } from './Finding.entity';
import type { ReviewPost } from './ReviewPost.entity';

@Entity()
@Index(['pr_id', 'created_at'])
export class ReviewRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false })
  pr_id!: string;

  @Column({ type: 'varchar', nullable: false })
  head_sha!: string;

  @Column({ type: 'enum', enum: RunStatus, default: RunStatus.Queued })
  status!: RunStatus;

  @Column({ type: 'boolean', default: false })
  is_self_review!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  context_pack!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  toolkit_raw_output!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  brief!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  architecture_review!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  risk_signals!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'text', nullable: true })
  prompt!: string | null;

  @Column({ type: 'varchar', nullable: true })
  stack_id!: string | null;

  @Column({ type: 'text', nullable: true })
  cli_output!: string | null;

  @Column({ type: 'varchar', nullable: true })
  session_id!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => require('./PullRequest.entity').PullRequest,
    (pr: PullRequest) => pr.reviewRuns,
  )
  @JoinColumn({ name: 'pr_id' })
  pullRequest!: PullRequest;

  @OneToMany(
    () => require('./Finding.entity').Finding,
    (finding: Finding) => finding.reviewRun,
  )
  findings!: Finding[];

  @OneToOne(
    () => require('./ReviewPost.entity').ReviewPost,
    (post: ReviewPost) => post.reviewRun,
  )
  reviewPost!: ReviewPost;
}
