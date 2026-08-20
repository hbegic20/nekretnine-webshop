import { LISTING_SORTS, PROPERTY_TYPES, TRANSACTION_TYPES, type ListingSort, type PropertyType, type TransactionType } from './listing.js'
import { TOWN_SLUGS, type Town } from './towns.js'

/**
 * Search state.
 *
 * This lives in /shared and is parsed by one function used on both sides,
 * which is the whole trick: the URL is the single source of truth for a
 * search, and the browser, the Next.js server and the Express API all read it
 * with the same code.
 *
 * The alternative — the frontend building a query string and the API parsing
 * it with separately written rules — means the two drift, and the bug shows up
 * as "the filter works until you reload the page".
 */
export interface ListingFilters {
  q?: string
  town?: Town
  propertyType?: PropertyType
  transactionType?: TransactionType
  priceMin?: number
  priceMax?: number
  bedsMin?: number
  bathsMin?: number
  sizeMin?: number
  sizeMax?: number
  sort: ListingSort
  page: number
}

/**
 * Accepts both Next's `searchParams` and Express's `req.query`.
 *
 * The values are `unknown` rather than `string | string[]` because Express
 * genuinely produces more than that: `?a[b]=c` parses into a nested object,
 * and `?a[0]=x` into an array. None of those are filters we understand, so the
 * readers below narrow to a string and ignore everything else.
 *
 * Typing this as `string | string[]` would have been a lie that TypeScript
 * happily believed, and the mismatch would have surfaced at runtime as
 * `.trim is not a function` on a URL somebody crafted.
 */
export type RawQuery = Record<string, unknown>

function one(value: unknown): string | undefined {
  // ?town=a&town=b is either a bug or someone poking at the URL. Take the
  // first rather than failing — a search page should degrade, not 500.
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function positiveInt(value: unknown): number | undefined {
  const text = one(value)
  if (text === undefined) return undefined
  const parsed = Number(text)
  // Number('') is 0 and Number('abc') is NaN; neither is a filter.
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.floor(parsed)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const text = one(value)
  return text !== undefined && (allowed as readonly string[]).includes(text) ? (text as T) : undefined
}

/**
 * Parse, discarding anything invalid rather than erroring.
 *
 * A search URL is public and gets edited by hand, truncated by chat apps and
 * mangled by link previewers. `?town=atlantis` should quietly show unfiltered
 * results, not a stack trace — while still never reaching the database, since
 * only values from the known list survive.
 */
export function parseListingFilters(query: RawQuery): ListingFilters {
  const q = one(query.q)

  let priceMin = positiveInt(query.priceMin)
  let priceMax = positiveInt(query.priceMax)
  // Someone typing 200000–50000 means the range, not an empty result.
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    ;[priceMin, priceMax] = [priceMax, priceMin]
  }

  let sizeMin = positiveInt(query.sizeMin)
  let sizeMax = positiveInt(query.sizeMax)
  if (sizeMin !== undefined && sizeMax !== undefined && sizeMin > sizeMax) {
    ;[sizeMin, sizeMax] = [sizeMax, sizeMin]
  }

  const requestedSort = oneOf(query.sort, LISTING_SORTS)
  const sort: ListingSort =
    // Relevance without a keyword ranks nothing; newest without one is the
    // sensible default. Guarding here means the API never has to.
    requestedSort === 'relevance' && !q ? 'newest' : (requestedSort ?? (q ? 'relevance' : 'newest'))

  return {
    ...(q !== undefined ? { q } : {}),
    ...(oneOf(query.town, TOWN_SLUGS) !== undefined ? { town: oneOf(query.town, TOWN_SLUGS)! } : {}),
    ...(oneOf(query.propertyType, PROPERTY_TYPES) !== undefined
      ? { propertyType: oneOf(query.propertyType, PROPERTY_TYPES)! }
      : {}),
    ...(oneOf(query.transactionType, TRANSACTION_TYPES) !== undefined
      ? { transactionType: oneOf(query.transactionType, TRANSACTION_TYPES)! }
      : {}),
    ...(priceMin !== undefined ? { priceMin } : {}),
    ...(priceMax !== undefined ? { priceMax } : {}),
    ...(positiveInt(query.bedsMin) !== undefined ? { bedsMin: positiveInt(query.bedsMin)! } : {}),
    ...(positiveInt(query.bathsMin) !== undefined ? { bathsMin: positiveInt(query.bathsMin)! } : {}),
    ...(sizeMin !== undefined ? { sizeMin } : {}),
    ...(sizeMax !== undefined ? { sizeMax } : {}),
    sort,
    page: Math.max(1, positiveInt(query.page) ?? 1),
  }
}

/** The inverse: filters back into a query string, omitting anything unset. */
export function listingFiltersToQuery(filters: Partial<ListingFilters>): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    // Defaults are left out so the common URL stays short and shareable.
    if (key === 'page' && value === 1) continue
    if (key === 'sort' && value === 'newest' && !filters.q) continue
    params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

/** How many filters are active, for the "clear filters" affordance. */
export function countActiveFilters(filters: ListingFilters): number {
  const { sort: _sort, page: _page, ...rest } = filters
  return Object.values(rest).filter((v) => v !== undefined && v !== '').length
}
