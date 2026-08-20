import argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'
import { eq, lt, sql } from 'drizzle-orm'
import type { PublicUser } from 'shared'
import { db } from '../db/index.js'
import { users, sessions, type User } from '../db/schema.js'
import { env } from '../env.js'
import { log } from '../log.js'
import { conflict, unauthorized } from '../http/errors.js'

/**
 * Argon2id parameters, from the OWASP Password Storage Cheat Sheet.
 *
 * The point of a password hash is to be *slow*. A fast hash (sha256, md5) can
 * be brute-forced at billions of guesses per second on a GPU; argon2id is
 * deliberately expensive in both time and memory, so an attacker who steals
 * the database still cannot work backwards to the passwords.
 *
 *   memoryCost  19 MiB per hash — this is the part GPUs hate
 *   timeCost    2 passes over that memory
 *   parallelism 1 thread
 *
 * Raising these makes login slower for everyone, including you. These values
 * are the current recommended balance.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * A throwaway hash, used to make a failed login take the same time whether or
 * not the email exists.
 *
 * Without it, "no such user" returns immediately while "wrong password" spends
 * ~50ms in argon2 — and that difference is measurable over the network. An
 * attacker could use it to discover which email addresses have accounts. So
 * when the user is not found we verify against this instead and discard the
 * result.
 */
const DUMMY_HASH = await argon2.hash('this password matches nothing', ARGON2_OPTIONS)

/** Strips everything that must never reach a browser — the hash above all. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    isSeller: user.isSeller,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
  }
}

/** Lowercase and trim, so Haris@X.com and haris@x.com are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/*
 * ---------------------------------------------------------------------------
 * Sessions
 * ---------------------------------------------------------------------------
 * The cookie holds a random token. The database stores only the SHA-256 of
 * that token, never the token itself.
 *
 * This mirrors how passwords are handled, and for the same reason: if someone
 * gets a copy of the sessions table — a leaked backup, a SQL injection, an
 * over-shared read replica — the rows are useless to them, because a hash
 * cannot be turned back into the cookie value it came from.
 *
 * Plain SHA-256 is correct *here* and wrong for passwords. A session token is
 * 32 random bytes, so there is nothing to guess and no dictionary to try; the
 * slowness of argon2 would buy nothing and would cost us a rehash on every
 * single request.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface CreatedSession {
  token: string
  expiresAt: Date
}

export async function createSession(userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt })

  return { token, expiresAt }
}

/**
 * Resolve a cookie value to a user, or null.
 *
 * Expiry is enforced here in application code as well as being a column, and
 * an expired row is deleted on sight rather than left to the sweeper.
 */
export async function getUserBySessionToken(token: string): Promise<User | null> {
  const id = hashToken(token)

  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  return row.user
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

/**
 * Housekeeping. Expired rows are harmless — nothing will ever authenticate
 * against them — but left alone the table grows forever.
 */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({
    id: sessions.id,
  })
  if (deleted.length > 0) log.info('swept expired sessions', { count: deleted.length })
  return deleted.length
}

/*
 * ---------------------------------------------------------------------------
 * Register and log in
 * ---------------------------------------------------------------------------
 */

export interface RegisterInput {
  email: string
  password: string
  name: string
  phone?: string | undefined
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const email = normalizeEmail(input.email)

  /*
   * We tell people plainly that an email is already registered.
   *
   * That is an account-enumeration leak: someone can learn who has an account
   * here. The alternative — accepting the signup and silently emailing "you
   * already have an account" — hides it, at the cost of a confusing dead end
   * for every ordinary person who forgot they signed up.
   *
   * For a small local listings site, where knowing that someone has an account
   * reveals very little, clarity wins. On a site where membership itself is
   * sensitive, it would not.
   */
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (existing.length > 0) {
    throw conflict('An account with that email already exists')
  }

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS)

  try {
    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
      })
      .returning()

    const user = inserted[0]
    if (!user) throw new Error('insert returned no row')

    log.info('user registered', { userId: user.id })
    return user
  } catch (error) {
    /*
     * The check above can lose a race: two signups for the same address, in
     * flight at the same time, both see "no existing user". The unique index
     * on lower(email) is what actually guarantees correctness, and this turns
     * its error into the same clean 409.
     *
     * The general lesson: a check-then-act pair is never atomic on its own.
     * The database constraint is the real rule; the check is only there to
     * produce a nicer message in the common case.
     */
    if (isUniqueViolation(error)) {
      throw conflict('An account with that email already exists')
    }
    throw error
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

export async function verifyCredentials(emailInput: string, password: string): Promise<User> {
  const email = normalizeEmail(emailInput)

  const rows = await db
    .select()
    .from(users)
    // Matching on lower(email) lets Postgres use the functional unique index
    // created in the first migration, and works whatever case is stored.
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const user = rows[0]

  if (!user) {
    // Burn the same time we would have spent verifying a real hash.
    await argon2.verify(DUMMY_HASH, password).catch(() => false)
    throw unauthorized('Incorrect email or password')
  }

  const ok = await argon2.verify(user.passwordHash, password).catch(() => false)
  if (!ok) {
    // Note the message is identical to the one above. Saying "no such user"
    // versus "wrong password" would hand out the same information the timing
    // defence is there to protect.
    throw unauthorized('Incorrect email or password')
  }

  return user
}
