/**
 * The user object as the API returns it.
 *
 * Note what is absent: `passwordHash`. This type is the contract, so the shape
 * that leaves the server is defined in one place and the frontend compiles
 * against it. If someone ever adds a sensitive field to the database row, they
 * have to consciously add it here too before it can reach a browser.
 */
export interface PublicUser {
  id: string
  email: string
  name: string
  phone: string | null
  isSeller: boolean
  isAdmin: boolean
  /** ISO 8601 — JSON has no date type, so it arrives as a string. */
  createdAt: string
}

/**
 * Password rules, defined once so the browser and the API agree.
 *
 * The frontend check is a courtesy — it tells someone their password is too
 * short without a round trip. The API check is the real one: anything can post
 * to an HTTP endpoint, so client-side validation is a UX feature and never a
 * security control.
 *
 * Eight characters is the OWASP floor. Length matters far more than forced
 * symbols and digits, which mostly push people toward "Password1!" and a
 * sticky note.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

export const AUTH_COOKIE_NAME = 'sid'
