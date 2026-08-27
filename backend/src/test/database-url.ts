/**
 * Where the integration tests find their database.
 *
 * Read by `vitest.integration.config.ts` (which puts it in the environment for
 * the test workers) and by `global-setup.ts` (which runs in vitest's own
 * process, before that environment exists). One definition, so the setup step
 * and the tests cannot end up pointing at different databases — a failure that
 * would look like "migrations ran but every table is missing".
 *
 * Note it does not go through env.ts: that module validates the *application's*
 * configuration and exits the process when something is missing, which is
 * exactly wrong for a test harness that is still deciding what to connect to.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://nekretnine:nekretnine@localhost:5432/nekretnine_test'

/**
 * The same server, but connected to the built-in `postgres` database.
 *
 * You cannot create a database from inside itself, so the CREATE DATABASE in
 * global-setup has to be issued over a connection to some other one.
 */
export function maintenanceUrl(databaseUrl: string): { url: string; database: string } {
  const parsed = new URL(databaseUrl)
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!database) throw new Error(`No database name in TEST_DATABASE_URL: ${databaseUrl}`)

  parsed.pathname = '/postgres'
  return { url: parsed.toString(), database }
}
