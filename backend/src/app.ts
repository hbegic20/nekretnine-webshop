import express from 'express'
import rateLimit from 'express-rate-limit'
import { sql } from 'drizzle-orm'
import { env } from './env.js'
import { log } from './log.js'
import { db } from './db/index.js'
import { errorHandler, notFoundHandler } from './http/errors.js'
import { loadUser } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { listingsRouter } from './routes/listings.js'
import { imageItemRouter } from './routes/images.js'
import { favoritesRouter } from './routes/favorites.js'
import { adminRouter } from './routes/admin.js'

export function createApp() {
  const app = express()

  /**
   * We sit behind the Next.js rewrite proxy (ARCHITECTURE.md §5.3), and in
   * production behind the host's load balancer too. Without this, every
   * request looks like it comes from the proxy's IP, which would make rate
   * limiting either useless or catastrophic — one abusive client would use up
   * everyone's quota.
   *
   * `1` means "trust exactly one hop". Never `true`, which trusts whatever
   * X-Forwarded-For header the client sends and lets anyone spoof their IP.
   */
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(express.json({ limit: '1mb' }))

  /**
   * A broad safety net, not the real protection. Auth, inquiry and upload
   * routes get their own much stricter limits when they are built in Phase 4.
   *
   * Note this is in-memory: it resets on restart and is per-process. Fine for
   * one server; if we ever run several, this needs a shared store.
   */
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: () => env.NODE_ENV === 'test',
    }),
  )

  /**
   * Serves uploaded images in development only. In production the browser
   * fetches them straight from R2 and this route does not exist.
   */
  if (env.STORAGE_DRIVER === 'disk') {
    app.use('/uploads', express.static(env.UPLOAD_DIR, { maxAge: '1h', index: false }))
  }

  /**
   * Two health checks, because they answer different questions.
   *
   * /health — "is this process alive?" Used by the container platform to
   * decide whether to restart us. It must not touch the database: if Postgres
   * blips, restarting the API would not help and the restart loop makes things
   * worse.
   *
   * /health/ready — "can this process actually serve traffic?" This one does
   * check the database, and is what you look at when debugging a deploy.
   */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.get('/health/ready', async (_req, res) => {
    try {
      await db.execute(sql`select 1`)
      res.json({ status: 'ready', database: 'up' })
    } catch (error) {
      log.error('readiness check failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(503).json({ status: 'not_ready', database: 'down' })
    }
  })

  /**
   * Identify the caller before any route runs. This never rejects anyone — it
   * only attaches `req.user` when there is a valid session cookie, so public
   * routes can still personalise themselves. See middleware/auth.ts.
   */
  app.use('/api', loadUser)

  app.use('/api/auth', authRouter)
  app.use('/api/listings', listingsRouter)
  app.use('/api/images', imageItemRouter)
  app.use('/api/favorites', favoritesRouter)
  app.use('/api/admin', adminRouter)
  // Further resources land here — one file per resource, as CLAUDE.md requires.

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
