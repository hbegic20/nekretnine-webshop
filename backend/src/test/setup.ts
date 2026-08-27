import { afterAll, beforeAll, beforeEach } from 'vitest'
import { pool } from '../db/index.js'
import { startTestServer, stopTestServer } from './api.js'
import { truncateAll } from './db.js'
import { installMailbox, resetMailbox } from './mailbox.js'

/**
 * Runs for every integration test file (vitest `setupFiles`), so no test has
 * to remember any of it.
 *
 * One server and one connection pool per file, a clean database per test. The
 * pool has to be closed at the end or vitest hangs waiting on an open handle —
 * which looks like a slow suite rather than a leak, and is worth knowing about
 * once rather than debugging twice.
 */

beforeAll(async () => {
  installMailbox()
  await startTestServer()
})

beforeEach(async () => {
  resetMailbox()
  await truncateAll()
})

afterAll(async () => {
  await stopTestServer()
  await pool.end()
})
