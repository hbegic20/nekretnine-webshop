import type { Response } from 'express'
import { AUTH_COOKIE_NAME } from 'shared'
import { env, isProduction } from '../env.js'

/**
 * Reading cookies without `cookie-parser`.
 *
 * The Cookie header is a single string like `sid=abc; theme=dark`. Splitting
 * it is genuinely this small, which is why we declined the dependency
 * (ARCHITECTURE.md §10). Writing cookies needs nothing at all — `res.cookie()`
 * is built into Express.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out

  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue

    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name) continue

    try {
      out[name] = decodeURIComponent(value)
    } catch {
      // A malformed percent-escape should not take down the request.
      out[name] = value
    }
  }

  return out
}

/**
 * Every flag here is doing a job:
 *
 *   httpOnly  JavaScript cannot read the cookie. If a cross-site scripting bug
 *             ever lands on the site, the attacker still cannot steal sessions.
 *             This is the single most important one.
 *   sameSite  'lax' means the cookie is not sent on cross-site POSTs, which
 *             blocks CSRF for state-changing requests, while still being sent
 *             when someone follows a link to us from Google. 'strict' would
 *             break that link case for no real gain here.
 *   secure    HTTPS only — in production. Not in development, because
 *             localhost is plain HTTP and the cookie would simply be dropped.
 *   path      Sent for the whole site.
 *
 * There is deliberately no `domain`: leaving it unset binds the cookie to the
 * exact origin that set it. Since the browser only ever talks to the Next.js
 * origin (the rewrite proxy, ARCHITECTURE.md §5.3), that is precisely right.
 */
export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  })
}

/**
 * Clearing must repeat the same flags. A browser matches cookies by name,
 * path and domain — get any of them wrong and it quietly keeps the old cookie,
 * which looks exactly like "logout is broken".
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  })
}
