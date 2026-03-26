import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReviewRun } from './ReviewRun.entity';

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

  @ManyToOne(() => ReviewRun)
  @JoinColumn({ name: 'run_id' })
  reviewRun!: ReviewRun;
}
