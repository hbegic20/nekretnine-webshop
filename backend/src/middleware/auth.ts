import type { RequestHandler } from 'express'
import { AUTH_COOKIE_NAME } from 'shared'
import { parseCookies } from '../http/cookies.js'
import { forbidden, unauthorized } from '../http/errors.js'
import { getUserBySessionToken } from '../services/auth.js'
import type { User } from '../db/schema.js'

/**
 * Runs on every request. Looks for a session cookie, and if there is a valid
 * one, attaches the user to the request.
 *
 * Note what it does *not* do: reject anyone. Most of the site is public, so
 * this middleware only answers "who is this, if anyone?" — deciding whether
 * that is good enough is each route's job, via the guards below.
 *
 * Separating identification from authorization keeps both simple, and means a
 * public route can still personalise itself (showing which listings you have
 * favourited, say) without any special casing.
 */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME]
  if (!token) return next()

  const user = await getUserBySessionToken(token)
  if (user) {
    req.user = user
    req.sessionToken = token
  }

  next()
}

/**
 * Guards for routes that need someone signed in.
 *
 * These exist so authorization is declared at the route — `router.post('/',
 * requireAuth, handler)` — rather than buried in the first few lines of every
 * handler, where a missing check is invisible during review.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized('You need to be signed in to do that')
  next()
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized('You need to be signed in to do that')
  if (!req.user.isAdmin) {
    // 403, not 404: the resource exists, this person may not have it. Hiding
    // the admin area behind a 404 buys nothing here — it is at a well-known
    // URL either way.
    throw forbidden('Administrators only')
  }
  next()
}

/**
 * Narrows `req.user` for handler bodies that run after `requireAuth`.
 *
 * TypeScript cannot know that middleware earlier in the chain guaranteed a
 * user, so without this every handler would need a non-null assertion — and
 * `!` is exactly the thing that turns a missing guard into a runtime crash
 * instead of a compile error. This throws loudly instead.
 */
export function currentUser(req: { user?: User }): User {
  if (!req.user) throw unauthorized('You need to be signed in to do that')
  return req.user
}
