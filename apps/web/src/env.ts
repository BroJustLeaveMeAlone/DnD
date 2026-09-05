import { z } from 'zod';

/**
 * Fail fast and loudly on a bad environment, at startup rather than at the
 * first request that happens to touch the database.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required — generate one with `npx auth secret`'),
  AUTH_URL: z.url().optional(),

  // Every provider is optional. The app boots with none configured and the
  // sign-in page says so, rather than failing at startup over a feature the
  // deployment may not want.
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AUTH_DISCORD_ID: z.string().optional(),
  AUTH_DISCORD_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment.\n${issues}\n\nCopy .env.example to .env at the repo root and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}
