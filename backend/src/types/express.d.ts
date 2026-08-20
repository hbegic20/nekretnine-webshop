import type { User } from '../db/schema.js'

/**
 * Teaching TypeScript about the properties our middleware adds to a request.
 *
 * Express's own `Request` type knows nothing about `req.user` — that is our
 * invention. Declaration merging adds the fields to the existing interface so
 * every handler sees them, without casting to `any` at each use.
 *
 * `user` is optional on purpose. Most routes are public, so the type system
 * should force a handler to consider the signed-out case rather than letting
 * it assume a user is present. `requireAuth` narrows it to non-null.
 */
declare global {
  namespace Express {
    interface Request {
      user?: User
      sessionToken?: string
    }
  }
}

export {}
