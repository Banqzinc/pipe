import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Repo } from '../entities/Repo.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Repo, PullRequest, ReviewRun, Finding, ReviewPost],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: ['error', 'warn'],
});
