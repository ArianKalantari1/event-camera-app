import { z } from 'zod';

/**
 * Environment is validated lazily, not at module load.
 *
 * Next builds pages at compile time in environments that legitimately have no
 * database or storage credentials. Throwing at import would break the build
 * rather than the request that actually needs the value.
 */

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.storage'),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  MAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
  MAIL_FROM: z.string().default('Event hub <onboarding@resend.dev>'),
  MAIL_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}\n\nSee .env.example.`);
  }

  const value = parsed.data;
  if (value.MAIL_DRIVER === 'resend' && !value.MAIL_API_KEY) {
    throw new Error('MAIL_DRIVER=resend requires MAIL_API_KEY. See .env.example.');
  }
  if (value.STORAGE_DRIVER === 's3') {
    const missing = (['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter(
      (k) => !value[k],
    );
    if (missing.length) {
      throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}. See .env.example.`);
    }
  }

  cached = value;
  return cached;
}

/** Test helper: forget the memoised value so a changed process.env is re-read. */
export function resetEnvCache(): void {
  cached = null;
}
