import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FindingSeverity, FindingStatus } from './enums';
import type { ReviewRun } from './ReviewRun.entity';
import type { PullRequest } from './PullRequest.entity';

@Entity()
@Index(['run_id', 'toolkit_order'])
@Index(['run_id', 'status'])
export class Finding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false })
  run_id!: string;

  @Column({ type: 'varchar', nullable: false })
  file_path!: string;

  @Column({ type: 'int', nullable: false })
  start_line!: number;

  @Column({ type: 'int', nullable: true })
  end_line!: number | null;

  @Column({ type: 'enum', enum: FindingSeverity, nullable: false })
  severity!: FindingSeverity;

  @Column({ type: 'float', nullable: false })
  confidence!: number;

  @Column({ type: 'varchar', nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', nullable: false })
  title!: string;

  @Column({ type: 'text', nullable: false })
  body!: string;

  @Column({ type: 'text', nullable: true })
  suggested_fix!: string | null;

  @Column({ type: 'varchar', nullable: true })
  rule_ref!: string | null;

  @Column({ type: 'enum', enum: FindingStatus, default: FindingStatus.Pending })
  status!: FindingStatus;

  @Column({ type: 'text', nullable: true })
  edited_body!: string | null;

  @Column({ type: 'int', nullable: false })
  toolkit_order!: number;

  @Column({ type: 'uuid', nullable: true })
  pr_id!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => require('./ReviewRun.entity').ReviewRun,
    (run: ReviewRun) => run.findings,
  )
  @JoinColumn({ name: 'run_id' })
  reviewRun!: ReviewRun;

  @ManyToOne(() => require('./PullRequest.entity').PullRequest, { nullable: true })
  @JoinColumn({ name: 'pr_id' })
  pullRequest!: PullRequest | null;
}
