import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { isProduction } from '../env.js'
import { log } from '../log.js'

/**
 * An error we *meant* to produce — "that listing does not exist", "you are not
 * allowed to edit this". Anything else that reaches the handler below is a bug.
 *
 * The distinction matters: expected errors return a clean status and message,
 * unexpected ones return a generic 500 and get logged with a stack trace. We
 * never leak an internal error message to the client, because those messages
 * routinely contain table names, file paths and query fragments.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string = 'error',
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(400, message, code)
export const unauthorized = (message = 'Not signed in') => new AppError(401, message, 'unauthorized')
export const forbidden = (message = 'Not allowed') => new AppError(403, message, 'forbidden')
export const notFound = (message = 'Not found') => new AppError(404, message, 'not_found')
export const conflict = (message: string) => new AppError(409, message, 'conflict')

/** Catch-all for unmatched routes, so a typo'd URL returns JSON, not HTML. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } })
}

/**
 * Express 5 forwards rejected promises from async handlers here automatically.
 * (In Express 4 an unhandled rejection would hang the request instead — one of
 * the better reasons to be on 5.)
 *
 * The four-argument signature is how Express recognises error middleware, so
 * `next` must stay even though it is unused.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Some fields are invalid',
        fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }

  const error = err instanceof Error ? err : new Error(String(err))
  log.error('unhandled error', {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack,
  })

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProduction ? 'Something went wrong' : error.message,
    },
  })
}
