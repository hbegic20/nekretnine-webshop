import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../env.js'
import { log } from '../log.js'
import * as schema from './schema.js'

/**
 * One connection pool for the whole process.
 *
 * Opening a TCP connection to Postgres and authenticating takes a few
 * milliseconds — far too long to do per request. The pool keeps a small set of
 * connections open and hands them out, so a query borrows one and returns it.
 *
 * `max: 10` is deliberately modest. Managed Postgres plans cap total
 * connections (Neon's free tier is low), and more pooled connections than the
 * database allows produces confusing "too many clients" errors under load.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  // An idle client failed — the network dropped, or the DB restarted. The pool
  // discards it and carries on; without this handler Node would crash.
  log.error('unexpected postgres pool error', { error: err.message })
})

/**
 * Passing `schema` is what enables the relational query API
 * (`db.query.listings.findMany({ with: { images: true } })`). Without it you
 * still get the SQL-like builder, but not the nested fetches.
 */
export const db = drizzle(pool, { schema })

export type Db = typeof db
export { schema }
