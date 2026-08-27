import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { TEST_DATABASE_URL, maintenanceUrl } from './database-url.js'

/**
 * Runs once, in vitest's own process, before any test file.
 *
 * Creates the test database if it is not there and brings its schema up to
 * date — the same migration files the real app runs, applied by the same
 * migrator. That last part is the point: a test suite that builds its schema
 * from `schema.ts` directly would pass happily while a migration file was
 * broken, which is precisely the failure worth catching before a deploy.
 */
export async function setup(): Promise<void> {
  await createDatabaseIfMissing()

  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 })
  try {
    await migrate(drizzle(pool), {
      // Resolved from this file rather than from the working directory, so it
      // does not depend on where vitest was started from.
      migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)),
    })
  } finally {
    await pool.end()
  }
}

/**
 * A connection refusal arrives as an AggregateError whose own `message` is the
 * empty string — one entry per address the hostname resolved to. Printing it
 * directly gives "Original error:" and nothing after it, which is worse than
 * no line at all.
 */
function describe(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((inner) => describe(inner)).join('; ')
  }
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

async function createDatabaseIfMissing(): Promise<void> {
  const { url, database } = maintenanceUrl(TEST_DATABASE_URL)
  const pool = new Pool({ connectionString: url, max: 1 })

  try {
    const existing = await pool.query('select 1 from pg_database where datname = $1', [database])
    if (existing.rowCount === 0) {
      /*
       * The identifier is quoted by hand because CREATE DATABASE takes no
       * parameters — `$1` is only ever a value, never a table or database
       * name. The name comes from our own connection string rather than from
       * user input, and doubling any embedded quote is the standard escape.
       */
      await pool.query(`create database "${database.replace(/"/g, '""')}"`)
    }
  } catch (error) {
    /*
     * Almost always "connection refused": Postgres is not running. Say so,
     * with the command that fixes it — the raw ECONNREFUSED from pg names a
     * port and nothing else, and this is the error a new machine hits first.
     */
    throw new Error(
      `Could not reach Postgres at ${url}.\n` +
        `  Start it with: npm run db:up\n` +
        `  Or point the tests elsewhere with TEST_DATABASE_URL.\n` +
        `  Original error: ${describe(error)}`,
    )
  } finally {
    await pool.end()
  }
}
