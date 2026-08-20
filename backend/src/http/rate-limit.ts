import rateLimit from 'express-rate-limit'
import { env } from '../env.js'

const disabledInTests = () => env.NODE_ENV === 'test'

/**
 * Login and registration are rate limited far more tightly than the rest of
 * the API, because they are the two endpoints worth attacking.
 *
 * Without a limit, an attacker can try passwords as fast as the network
 * allows. Argon2 already makes each attempt cost ~50ms of CPU, which is real
 * protection — but that also means an unlimited attacker can exhaust the
 * server's CPU as a side effect. The limit protects both the accounts and the
 * machine.
 *
 * This is per-IP and in-memory, which has two honest limitations: it resets on
 * restart, and an attacker with many IP addresses walks around it. It stops
 * the common case (someone hammering one account from one machine) and is not
 * a substitute for account lockout, which would come later if abuse appears.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabledInTests,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } },
})

/**
 * Registration gets a stricter, longer window than login: a person legitimately
 * mistypes a password several times, but nobody legitimately creates ten
 * accounts an hour from one address.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabledInTests,
  message: { error: { code: 'rate_limited', message: 'Too many accounts created. Try again later.' } },
})

/**
 * The inquiry form is the one endpoint an anonymous stranger can use to make
 * us send email. Without a limit it is an open spam relay pointed at sellers.
 */
export const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabledInTests,
  message: { error: { code: 'rate_limited', message: 'Previše upita. Pokušajte kasnije.' } },
})

/**
 * Uploads are the most expensive thing an authenticated user can ask for —
 * each one decodes and re-encodes an image, which is real CPU. The limit is
 * generous enough for a seller adding a full gallery in one sitting.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabledInTests,
  message: { error: { code: 'rate_limited', message: 'Previše slanja. Pokušajte za koji minut.' } },
})
