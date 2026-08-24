import { expireDueListings } from '../services/expiry.js'
import { pool } from '../db/index.js'
import { log } from '../log.js'

/**
 * One-shot runner: `npm run job:expire`.
 *
 * The same work the API does on a timer, exposed as a command so it can be
 * driven by a real scheduler instead — a platform cron job, a GitHub Actions
 * schedule, or by hand while testing.
 *
 * Having both is deliberate. The in-process timer means the feature works with
 * no extra infrastructure, which suits one always-on API server. The command
 * means we are not stuck with that choice: moving to a proper scheduler later
 * needs no code change, only a cron entry.
 */
async function main(): Promise<void> {
  const result = await expireDueListings()
  log.info('expiry job finished', { expired: result.expired, notified: result.notified })
  await pool.end()
}

main().catch((error: unknown) => {
  log.error('expiry job failed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
