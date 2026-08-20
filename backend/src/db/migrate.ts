import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './index.js'
import { log } from '../log.js'

/**
 * Applies any migration files that have not run yet, then exits.
 *
 * Drizzle keeps a `__drizzle_migrations` table recording which files have been
 * applied, so this is safe to run repeatedly — on every deploy, for instance.
 * Migrations run inside a transaction: a failing one rolls back rather than
 * leaving the schema half-changed.
 *
 * Per CLAUDE.md, this is the *only* way the schema ever changes. Never edit
 * tables by hand in psql — the migration files are the source of truth, and a
 * hand-edit makes them a lie.
 */
async function main(): Promise<void> {
  log.info('running migrations…')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  log.info('migrations complete')
  await pool.end()
}

main().catch((error: unknown) => {
  log.error('migration failed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
