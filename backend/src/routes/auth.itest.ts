import { describe, expect, it } from 'vitest'
import { AUTH_COOKIE_NAME, type PublicUser } from 'shared'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { api, type ApiError } from '../test/api.js'
import { createUser, signIn, TEST_PASSWORD } from '../test/factories.js'

interface AuthResponse {
  user: PublicUser
}

const NEW_ACCOUNT = {
  email: 'novi@nekretnine.test',
  password: 'lozinka123',
  name: 'Novi Korisnik',
  phone: '061 111 222',
}

describe('POST /api/auth/register', () => {
  it('creates the account and signs the person straight in', async () => {
    const client = api()

    const response = await client.post<AuthResponse>('/api/auth/register', NEW_ACCOUNT)

    expect(response.status).toBe(201)
    expect(response.body.user.email).toBe(NEW_ACCOUNT.email)
    expect(response.body.user.isAdmin).toBe(false)

    // The session cookie came back on the register response itself, so the
    // same client can act immediately without logging in.
    const me = await client.get<AuthResponse>('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.id).toBe(response.body.user.id)
  })

  it('never returns the password hash', async () => {
    const response = await api().post<AuthResponse>('/api/auth/register', NEW_ACCOUNT)

    // Not `toBeUndefined()` on one field: the point is that nothing beyond the
    // agreed PublicUser shape leaks, so a column added later cannot ride along.
    expect(Object.keys(response.body.user).sort()).toEqual(
      ['createdAt', 'email', 'id', 'isAdmin', 'isSeller', 'name', 'phone'].sort(),
    )
  })

  it('sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const response = await api().post('/api/auth/register', NEW_ACCOUNT)

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`))
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    // Not Secure outside production — localhost is plain HTTP and the browser
    // would drop a Secure cookie, which looks exactly like login not working.
    expect(cookie).not.toMatch(/Secure/i)
  })

  it('rejects an email that is already registered, whatever the case', async () => {
    await createUser({ email: 'haris@nekretnine.test' })

    const response = await api().post<ApiError>('/api/auth/register', {
      ...NEW_ACCOUNT,
      email: 'Haris@Nekretnine.test',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('conflict')
  })

  it('rejects a password below the shared minimum, naming the field', async () => {
    const response = await api().post<ApiError>('/api/auth/register', {
      ...NEW_ACCOUNT,
      password: 'kratka',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('validation_failed')
    expect(response.body.error.fields?.map((f) => f.path)).toContain('password')
  })

  it('rejects an invalid email address', async () => {
    const response = await api().post<ApiError>('/api/auth/register', {
      ...NEW_ACCOUNT,
      email: 'not-an-email',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.fields?.map((f) => f.path)).toContain('email')
  })
})

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    const user = await createUser({ email: 'prodavac@nekretnine.test' })
    const client = api()

    const response = await client.post<AuthResponse>('/api/auth/login', {
      email: user.email,
      password: TEST_PASSWORD,
    })

    expect(response.status).toBe(200)
    expect(response.body.user.id).toBe(user.id)
  })

  it('accepts the email in any case', async () => {
    const user = await createUser({ email: 'prodavac@nekretnine.test' })

    const response = await api().post('/api/auth/login', {
      email: 'PRODAVAC@Nekretnine.TEST',
      password: TEST_PASSWORD,
    })

    expect(response.status).toBe(200)
    expect(user.email).toBe('prodavac@nekretnine.test')
  })

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await createUser()

    const wrongPassword = await api().post<ApiError>('/api/auth/login', {
      email: user.email,
      password: 'pogrešna-lozinka',
    })
    const unknownEmail = await api().post<ApiError>('/api/auth/login', {
      email: 'nepostoji@nekretnine.test',
      password: TEST_PASSWORD,
    })

    // Identical on purpose (services/auth.ts): a different message would hand
    // out exactly the account-existence answer the dummy hash is hiding.
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message)
  })

  it('gives each login its own session, so signing out on one device leaves the other alone', async () => {
    const user = await createUser()
    const laptop = await signIn(user)
    const phone = await signIn(user)

    expect(await sessionCount(user.id)).toBe(2)

    await phone.post('/api/auth/logout')

    expect((await phone.get('/api/auth/me')).status).toBe(401)
    expect((await laptop.get('/api/auth/me')).status).toBe(200)
    expect(await sessionCount(user.id)).toBe(1)
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session row, not just the cookie', async () => {
    const user = await createUser()
    const client = await signIn(user)

    const response = await client.post('/api/auth/logout')

    expect(response.status).toBe(204)
    // The row is what matters. Clearing the cookie alone would leave a token
    // that still works for anyone who captured it — the revocation a JWT
    // cannot do (ARCHITECTURE.md §5.2).
    expect(await sessionCount(user.id)).toBe(0)
    expect(client.cookieHeader()).not.toContain(AUTH_COOKIE_NAME)
  })

  it('succeeds when nobody is signed in', async () => {
    expect((await api().post('/api/auth/logout')).status).toBe(204)
  })
})

describe('GET /api/auth/me', () => {
  it('401s for an anonymous caller', async () => {
    const response = await api().get<ApiError>('/api/auth/me')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('unauthorized')
  })

  it('401s for a forged session cookie rather than failing', async () => {
    const client = api()
    client.setCookie(AUTH_COOKIE_NAME, 'izmišljeni-token')

    expect((await client.get('/api/auth/me')).status).toBe(401)
  })

  it('401s once the session row is gone from under it', async () => {
    const user = await createUser()
    const client = await signIn(user)

    // Simulates an admin revoking a session, or the sweeper removing an
    // expired one, while a browser still holds the cookie.
    await db.delete(sessions)

    expect((await client.get('/api/auth/me')).status).toBe(401)
  })
})

async function sessionCount(userId: string): Promise<number> {
  const rows = await db.select().from(sessions)
  return rows.filter((row) => row.userId === userId).length
}
