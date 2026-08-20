/**
 * Listing vocabulary shared by the API and the UI.
 *
 * These are `as const` arrays rather than TypeScript enums so that the same
 * value is usable three ways: as a runtime list (to build a dropdown or a zod
 * validator), as a union type, and as a Postgres enum in the Drizzle schema.
 * A TS `enum` would only give us the type.
 */

/**
 * The listing lifecycle. See SPEC.md §3 for the state machine.
 * Only PUBLISHED (and SOLD, when explicitly asked for) is ever public.
 */
export const LISTING_STATUSES = [
  'DRAFT',
  'PENDING',
  'REJECTED',
  'PUBLISHED',
  'EXPIRED',
  'SOLD',
] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

/** Statuses a request from the public internet is allowed to see. */
export const PUBLIC_STATUSES = ['PUBLISHED', 'SOLD'] as const

/**
 * Which transitions are legal, keyed by the status you are leaving.
 * The API checks against this table rather than scattering `if` statements
 * across route handlers — one place to read, one place to change.
 */
export const ALLOWED_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['PUBLISHED', 'REJECTED'],
  REJECTED: ['DRAFT'],
  PUBLISHED: ['EXPIRED', 'SOLD'],
  EXPIRED: ['PENDING'],
  SOLD: [],
}

export const PROPERTY_TYPES = ['apartment', 'house', 'land', 'commercial', 'garage'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const TRANSACTION_TYPES = ['sale', 'rent'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

/**
 * `relevance` only means anything when there is a keyword to be relevant to,
 * so it is the default when someone searches and unavailable when they have
 * not. Sorting an unfiltered list by relevance would be ordering by a score
 * that is zero for every row.
 */
export const LISTING_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc'] as const
export type ListingSort = (typeof LISTING_SORTS)[number]

/** Default number of days a listing stays published. Admin can override per listing. */
export const DEFAULT_EXPIRY_DAYS = 60

export const LISTINGS_PER_PAGE = 24
