import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'

/**
 * Every table, emptied between test cases.
 *
 * TRUNCATE rather than DELETE: it does not scan the rows, and CASCADE follows
 * the foreign keys so the order of this list does not matter. Each test then
 * starts from an empty database and creates exactly the rows it needs, which
 * is what makes a failure readable — the state under test is all in the test.
 *
 * The alternative, a transaction per test rolled back at the end, is faster
 * and tempting. It does not work here: the app opens its own connections from
 * the pool, so it would never see rows written inside the test's uncommitted
 * transaction. Testing over real HTTP means testing against committed data.
 */
const TABLES = ['payments', 'inquiries', 'favorites', 'images', 'sessions', 'listings', 'users']

export async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`))
}
