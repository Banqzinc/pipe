import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ReviewRun } from './ReviewRun.entity';

@Entity()
export class ReviewPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: false, unique: true })
  run_id!: string;

  @Column({ type: 'int', nullable: false })
  github_review_id!: number;

  @Column({ type: 'varchar', nullable: false })
  posted_sha!: string;

  @Column({ type: 'int', nullable: false })
  findings_count!: number;

  @Column({ type: 'timestamp', nullable: false })
  posted_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @OneToOne(
    () => ReviewRun,
    (run) => run.reviewPost,
  )
  @JoinColumn({ name: 'run_id' })
  reviewRun!: ReviewRun;
}
