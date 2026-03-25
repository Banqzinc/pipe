import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export interface PromptSection {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  content: string;
  editable: boolean;
  system: boolean;
}

@Entity()
@Unique(['name'])
export class PromptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', default: 'default' })
  name!: string;

  @Column({ type: 'text' })
  system_instructions!: string;

  @Column({ type: 'text' })
  output_instructions!: string;

  @Column({ type: 'jsonb', nullable: true })
  sections!: PromptSection[] | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
