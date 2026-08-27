import argon2 from 'argon2'
import { DEFAULT_EXPIRY_DAYS, type ListingInput } from 'shared'
import { db } from '../db/index.js'
import { listings, users, type Listing, type NewListing, type User } from '../db/schema.js'
import { api, type ApiClient } from './api.js'

/**
 * Arrange with the database, act over HTTP.
 *
 * Setting a listing up through the API — create, submit, publish — is three
 * requests and needs an admin, for a test whose subject is something else
 * entirely. These factories write the row directly so each test's arrangement
 * is one line, and the endpoints under test are still exercised through the
 * real stack.
 *
 * The exception is `signIn`, which deliberately goes through POST /api/auth/login:
 * forging a session row would skip the cookie round-trip that every other
 * request in the suite depends on.
 */

export const TEST_PASSWORD = 'lozinka123'

/**
 * argon2 is slow on purpose — around 50ms a hash with the parameters in
 * services/auth.ts. That is right for a login and pure waste for the twentieth
 * fixture user in a file, so the same hash is reused for every one of them.
 */
let cachedHash: Promise<string> | null = null
function passwordHash(): Promise<string> {
  cachedHash ??= argon2.hash(TEST_PASSWORD)
  return cachedHash
}

let counter = 0
function unique(prefix: string): string {
  counter += 1
  return `${prefix}${counter}`
}

export interface UserOptions {
  email?: string
  name?: string
  phone?: string | null
  isSeller?: boolean
  isAdmin?: boolean
}

export async function createUser(options: UserOptions = {}): Promise<User> {
  const rows = await db
    .insert(users)
    .values({
      email: options.email ?? `${unique('user')}@nekretnine.test`,
      passwordHash: await passwordHash(),
      name: options.name ?? 'Test Korisnik',
      phone: options.phone ?? '061 000 000',
      isSeller: options.isSeller ?? true,
      isAdmin: options.isAdmin ?? false,
    })
    .returning()

  const user = rows[0]
  if (!user) throw new Error('failed to create test user')
  return user
}

/** A signed-in client for an existing user. */
export async function signIn(user: User, password = TEST_PASSWORD): Promise<ApiClient> {
  const client = api()
  const response = await client.post('/api/auth/login', { email: user.email, password })
  if (response.status !== 200) {
    throw new Error(`sign-in failed for ${user.email}: ${response.status}`)
  }
  return client
}

export interface Actor {
  user: User
  client: ApiClient
}

export async function createSeller(options: UserOptions = {}): Promise<Actor> {
  const user = await createUser({ ...options, isAdmin: false })
  return { user, client: await signIn(user) }
}

/**
 * Admins are made, never registered — SPEC.md §2 says there is no public admin
 * signup, ever, so there is no endpoint for this to go through even in a test.
 */
export async function createAdmin(options: UserOptions = {}): Promise<Actor> {
  const user = await createUser({ ...options, isAdmin: true })
  return { user, client: await signIn(user) }
}

/**
 * A valid create payload. Valid is the point: tests that check validation
 * override one field, so the assertion is unambiguously about that field
 * rather than about whichever other one happened to be wrong too.
 */
export function listingInput(overrides: Partial<ListingInput> = {}): ListingInput {
  return {
    title: 'Trosoban stan u centru Bugojna',
    description: 'Prostran stan blizu škole i prodavnice, useljiv odmah.',
    price: 145_000,
    propertyType: 'apartment',
    transactionType: 'sale',
    town: 'bugojno',
    neighbourhood: 'Centar',
    address: 'Sultan Ahmedova 12',
    lat: 44.0575,
    lng: 17.4506,
    sizeM2: 78,
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    floor: 3,
    yearBuilt: 2005,
    contactName: 'Amir Prodavac',
    contactPhone: '061 000 000',
    contactEmail: 'prodavac@nekretnine.test',
    ...overrides,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A listing row in whatever state the test needs.
 *
 * PUBLISHED fills in `published_at` and `expires_at` the way the approval path
 * does. Without them a "published" fixture would sort oddly (newest orders by
 * published_at) and would never expire, and both would look like bugs in the
 * code under test.
 */
export async function insertListing(
  ownerId: string,
  overrides: Partial<NewListing> = {},
): Promise<Listing> {
  const status = overrides.status ?? 'DRAFT'
  const now = new Date()

  const published =
    status === 'PUBLISHED' || status === 'SOLD' || status === 'EXPIRED'
      ? {
          publishedAt: now,
          expiresAt: new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * DAY_MS),
        }
      : {}

  const rows = await db
    .insert(listings)
    .values({
      ownerId,
      title: 'Trosoban stan u centru Bugojna',
      description: 'Prostran stan blizu škole i prodavnice.',
      price: 145_000,
      propertyType: 'apartment',
      transactionType: 'sale',
      town: 'bugojno',
      contactName: 'Amir Prodavac',
      contactPhone: '061 000 000',
      contactEmail: 'prodavac@nekretnine.test',
      lat: 44.0575,
      lng: 17.4506,
      ...published,
      ...overrides,
    })
    .returning()

  const listing = rows[0]
  if (!listing) throw new Error('failed to create test listing')
  return listing
}

/** Shorthand for the most common fixture of all. */
export function publishedListing(
  ownerId: string,
  overrides: Partial<NewListing> = {},
): Promise<Listing> {
  return insertListing(ownerId, { status: 'PUBLISHED', ...overrides })
}

/** `days` in the past, for expiry and ordering tests. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS)
}
