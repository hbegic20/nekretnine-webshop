import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('.env')
} catch {
  // fall back to the real environment
}

/**
 * Config for the drizzle-kit CLI (`npm run db:generate`).
 *
 * `generate` compares src/db/schema.ts against the migrations already on disk
 * and writes a new .sql file for the difference. It does not touch the
 * database — that is `db:migrate`'s job. Keeping those two steps separate is
 * what lets you read and, if necessary, edit a migration before it runs.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
})
