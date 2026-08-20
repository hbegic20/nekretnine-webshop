import { createApp } from './app.js'
import { env } from './env.js'
import { log } from './log.js'
import { pool } from './db/index.js'

const app = createApp()

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
