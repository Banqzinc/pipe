import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.coerce.number().default(3100),
  databaseUrl: z.string(),
  jwtSecret: z.string().min(16),
  encryptionKey: z.string().length(64, 'PIPE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  reposDir: z.string().default('./repos'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env.PIPE_PORT,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.PIPE_ENCRYPTION_KEY,
    reposDir: process.env.PIPE_REPOS_DIR,
    nodeEnv: process.env.NODE_ENV,
  });
}
