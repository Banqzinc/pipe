import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { PullRequest } from './PullRequest.entity';

@Entity()
@Unique(['github_owner', 'github_name'])
export class Repo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: false })
  github_owner!: string;

  @Column({ type: 'varchar', nullable: false })
  github_name!: string;

  @Column({ type: 'varchar', nullable: false })
  github_webhook_secret!: string;

  @Column({ type: 'varchar', nullable: false })
  pat_token_encrypted!: string;

  @Column({ type: 'boolean', default: false })
  auto_trigger_on_open!: boolean;

  @Column({ type: 'jsonb', default: [] })
  rule_paths!: string[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(
    () => PullRequest,
    (pr) => pr.repo,
  )
  pullRequests!: PullRequest[];
}
