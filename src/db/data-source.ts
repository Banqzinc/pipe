import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Repo } from '../entities/Repo.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { PromptTemplate } from '../entities/PromptTemplate.entity';
import { ChatMessage } from '../entities/ChatMessage.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Repo, PullRequest, ReviewRun, Finding, ReviewPost, PromptTemplate, ChatMessage],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  synchronize: false,
  logging: ['error', 'warn'],
});
