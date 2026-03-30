import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { ReviewRun } from './ReviewRun.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  run_id!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: 'user' | 'assistant';

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => require('./ReviewRun.entity').ReviewRun)
  @JoinColumn({ name: 'run_id' })
  reviewRun!: ReviewRun;
}
