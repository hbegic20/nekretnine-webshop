import { createApp } from './app.js'
import { env } from './env.js'
import { log } from './log.js'
import { pool } from './db/index.js'
import { deleteExpiredSessions } from './services/auth.js'
import { expireDueListings } from './services/expiry.js'

const app = createApp()

/**
 * Sweep expired session rows hourly.
 *
 * They are harmless — nothing can authenticate against an expired row, since
 * getUserBySessionToken checks the date — but without this the table only ever
 * grows. `unref()` keeps the timer from holding the process open during
 * shutdown.
 */
const sessionSweep = setInterval(
  () => {
    void deleteExpiredSessions().catch((error: unknown) => {
      log.warn('session sweep failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  },
  60 * 60 * 1000,
)
sessionSweep.unref()

/**
 * Expire listings whose date has passed, hourly.
 *
 * An hour is deliberately coarse. Nobody minds a listing staying up for
 * another forty minutes past midnight on its expiry day, and checking every
 * minute would be sixty times the queries for no benefit anyone can perceive.
 *
 * It also runs shortly after boot, so a deploy or restart catches anything
 * that fell due while the process was down.
 */
const expirySweep = setInterval(
  () => {
    void expireDueListings().catch((error: unknown) => {
      log.warn('expiry sweep failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  },
  60 * 60 * 1000,
)
expirySweep.unref()

const catchUpAfterBoot = setTimeout(() => {
  void expireDueListings().catch(() => undefined)
}, 10_000)
catchUpAfterBoot.unref()

const server = app.listen(env.PORT, () => {
  log.info('api listening', {
    port: env.PORT,
    env: env.NODE_ENV,
    storage: env.STORAGE_DRIVER,
    mail: env.MAIL_DRIVER,
  })
})

/**
 * Graceful shutdown.
 *
 * When a platform deploys a new version it sends SIGTERM and then, after a
 * grace period, SIGKILL. Without this handler the process dies instantly and
 * any request in flight — including a half-finished database write — is cut
 * off mid-response. Here we stop accepting new connections, let the current
 * ones finish, close the pool, and exit.
 */
function shutdown(signal: string): void {
  log.info('shutting down', { signal })
  clearInterval(sessionSweep)
  clearInterval(expirySweep)
  clearTimeout(catchUpAfterBoot)

  server.close(() => {
    void pool.end().then(() => {
      log.info('shutdown complete')
      process.exit(0)
    })
  })

  // If something hangs, do not wait forever for the platform's SIGKILL.
  setTimeout(() => {
    log.error('forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
