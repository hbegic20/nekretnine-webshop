import { Router } from 'express'
import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from 'shared'
import {
  createSession,
  destroySession,
  registerUser,
  toPublicUser,
  verifyCredentials,
} from '../services/auth.js'
import { clearSessionCookie, setSessionCookie } from '../http/cookies.js'
import { authLimiter, registerLimiter } from '../http/rate-limit.js'
import { currentUser, requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

/*
 * Validation schemas live next to the routes that use them.
 *
 * zod does two jobs at once here: it rejects bad input at runtime, and it
 * gives us a typed object afterwards. `parse` throws a ZodError, which the
 * error handler turns into a 400 listing exactly which fields are wrong — so
 * no handler needs its own validation code.
 */
const registerSchema = z.object({
  email: z.email('Enter a valid email address').max(255),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().min(2, 'Enter your name').max(100),
  phone: z.string().trim().max(30).optional(),
})

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  // Deliberately not the full password policy. Rules here would reject an old
  // password that no longer meets current requirements, locking out someone
  // who typed the right thing.
  password: z.string().min(1, 'Enter your password'),
})

/**
 * POST /api/auth/register
 *
 * Creates the account and signs the person straight in — they have just proved
 * they know the password, so making them type it again is friction for
 * nothing.
 */
authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body)

  const user = await registerUser(input)
  const session = await createSession(user.id)
  setSessionCookie(res, session.token, session.expiresAt)

  res.status(201).json({ user: toPublicUser(user) })
})

/**
 * POST /api/auth/login
 *
 * A fresh session row per login, so signing in on a phone does not disturb the
 * session on a laptop, and "sign out" on one device leaves the other alone.
 */
authRouter.post('/login', authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body)

  const user = await verifyCredentials(input.email, input.password)
  const session = await createSession(user.id)
  setSessionCookie(res, session.token, session.expiresAt)

  res.json({ user: toPublicUser(user) })
})

/**
 * POST /api/auth/logout
 *
 * POST rather than GET, because it changes state. A GET logout can be
 * triggered by anything that loads a URL — an <img> tag on another site, a
 * link prefetcher — which is how people end up mysteriously signed out.
 *
 * The session row is deleted, not just the cookie. Clearing the cookie alone
 * would leave a token that still works if anyone captured it; this is the
 * revocation that JWTs cannot do (ARCHITECTURE.md §5.2).
 */
authRouter.post('/logout', async (req, res) => {
  if (req.sessionToken) await destroySession(req.sessionToken)
  clearSessionCookie(res)
  res.status(204).end()
})

/**
 * GET /api/auth/me
 *
 * How the frontend asks "who am I?" on load. 401 when signed out is a normal
 * answer here, not an error worth logging.
 */
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(currentUser(req)) })
})
