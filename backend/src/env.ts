import { z } from 'zod'

/**
 * Loading .env without a dependency.
 *
 * Node has had `process.loadEnvFile()` built in since v20.12, so `dotenv` is
 * a package we simply do not need. It throws if the file is missing, which is
 * fine and expected in production, where the platform injects real env vars.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // no .env file — real environment variables are expected instead
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** How long a login lasts before the session row expires. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // --- storage (ARCHITECTURE.md §6) ---
  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_UPLOAD_BASE_URL: z.string().default('http://localhost:4000/uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  // --- email (ARCHITECTURE.md §6.4) ---
  MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().default('Nekretnine <noreply@example.com>'),
  SMTP_URL: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

/**
 * Cross-field rules that a per-field schema cannot express.
 *
 * The first one is the important one, and the reason it exists is written up
 * in ARCHITECTURE.md §6.2: container filesystems on Render, Railway and
 * friends are wiped on every deploy and restart. If production ever boots with
 * the disk driver, uploads appear to succeed and then silently disappear.
 *
 * A loud crash at startup is enormously better than quietly losing the photos
 * people uploaded. Fail fast, fail visibly.
 */
function checkConsistency(e: Env): void {
  const errors: string[] = []

  if (e.NODE_ENV === 'production' && e.STORAGE_DRIVER === 'disk') {
    errors.push(
      'STORAGE_DRIVER=disk is not allowed in production: container filesystems ' +
        'are ephemeral, so uploaded images would be lost on the next deploy. ' +
        'Set STORAGE_DRIVER=s3 and configure the S3_* variables.',
    )
  }

  if (e.STORAGE_DRIVER === 's3') {
    for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const) {
      if (!e[key]) errors.push(`${key} is required when STORAGE_DRIVER=s3`)
    }
  }

  if (e.MAIL_DRIVER === 'smtp' && !e.SMTP_URL) {
    errors.push('SMTP_URL is required when MAIL_DRIVER=smtp')
  }

  if (errors.length > 0) {
    console.error('Invalid environment configuration:')
    for (const message of errors) console.error(`  ${message}`)
    process.exit(1)
  }

  // Not fatal: you *can* run production with console mail, but you almost
  // certainly did not mean to, so say so every single boot.
  if (e.NODE_ENV === 'production' && e.MAIL_DRIVER === 'console') {
    console.warn('WARNING: MAIL_DRIVER=console in production — no email will actually be delivered.')
  }
}

checkConsistency(env)

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
