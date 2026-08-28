import { describe, it, expect } from 'vitest'
import {
  countActiveFilters,
  formatDate,
  formatPrice,
  listingFiltersToQuery,
  parseListingFilters,
  slavicPlural,
} from 'shared'

/*
 * These test code that lives in /shared. It runs from here because the backend
 * is the workspace with a test runner configured; if /shared grows more logic
 * it should get its own.
 *
 * This parser is worth testing hard: it is the only thing standing between a
 * hand-edited public URL and a database query.
 */

describe('parseListingFilters', () => {
  it('defaults to newest, page 1, with nothing set', () => {
    expect(parseListingFilters({})).toEqual({ sort: 'newest', page: 1 })
  })

  it('keeps values from the known lists and drops the rest', () => {
    const filters = parseListingFilters({ town: 'jajce', propertyType: 'house' })
    expect(filters.town).toBe('jajce')
    expect(filters.propertyType).toBe('house')
  })

  it('silently ignores a town that does not exist', () => {
    // A search URL gets edited by hand and mangled by link previewers. It must
    // degrade to "no filter", never to an error, and never reach SQL.
    expect(parseListingFilters({ town: 'atlantis' }).town).toBeUndefined()
    expect(parseListingFilters({ propertyType: '; drop table listings' }).propertyType).toBeUndefined()
  })

  it('ignores non-numeric and negative numbers', () => {
    expect(parseListingFilters({ priceMin: 'abc' }).priceMin).toBeUndefined()
    expect(parseListingFilters({ priceMin: '-5' }).priceMin).toBeUndefined()
    expect(parseListingFilters({ priceMin: '' }).priceMin).toBeUndefined()
  })

  it('swaps a backwards price range instead of returning nothing', () => {
    const filters = parseListingFilters({ priceMin: '200000', priceMax: '50000' })
    expect(filters.priceMin).toBe(50_000)
    expect(filters.priceMax).toBe(200_000)
  })

  it('swaps a backwards size range too', () => {
    const filters = parseListingFilters({ sizeMin: '120', sizeMax: '40' })
    expect([filters.sizeMin, filters.sizeMax]).toEqual([40, 120])
  })

  it('takes the first value when a parameter is repeated', () => {
    expect(parseListingFilters({ town: ['travnik', 'jajce'] }).town).toBe('travnik')
  })

  it('survives the nested objects Express can produce from ?a[b]=c', () => {
    // req.query is ParsedQs, not Record<string, string>. This shape is exactly
    // what broke the first version of the type.
    expect(() => parseListingFilters({ town: { evil: 'yes' } })).not.toThrow()
    expect(parseListingFilters({ town: { evil: 'yes' } }).town).toBeUndefined()
  })

  it('defaults to relevance when there is a keyword', () => {
    expect(parseListingFilters({ q: 'stan' }).sort).toBe('relevance')
  })

  it('refuses relevance without a keyword, since there is nothing to rank', () => {
    expect(parseListingFilters({ sort: 'relevance' }).sort).toBe('newest')
  })

  it('honours an explicit sort', () => {
    expect(parseListingFilters({ sort: 'price_asc' }).sort).toBe('price_asc')
    expect(parseListingFilters({ q: 'stan', sort: 'price_desc' }).sort).toBe('price_desc')
  })

  it('never returns a page below 1', () => {
    expect(parseListingFilters({ page: '0' }).page).toBe(1)
    expect(parseListingFilters({ page: '-3' }).page).toBe(1)
    expect(parseListingFilters({ page: '4' }).page).toBe(4)
  })
})

describe('listingFiltersToQuery', () => {
  it('omits defaults so a plain search has a clean URL', () => {
    expect(listingFiltersToQuery({ sort: 'newest', page: 1 })).toBe('')
  })

  it('includes the filters that are set', () => {
    const query = listingFiltersToQuery({ town: 'kupres', priceMax: 120_000, sort: 'newest', page: 1 })
    expect(query).toContain('town=kupres')
    expect(query).toContain('priceMax=120000')
  })

  it('round-trips through the parser', () => {
    const original = parseListingFilters({ town: 'travnik', priceMin: '50000', bedsMin: '2', sort: 'price_asc', page: '3' })
    const reparsed = parseListingFilters(
      Object.fromEntries(new URLSearchParams(listingFiltersToQuery(original))),
    )
    expect(reparsed).toEqual(original)
  })
})

describe('countActiveFilters', () => {
  it('does not count sort or page as filters', () => {
    expect(countActiveFilters(parseListingFilters({ sort: 'price_asc', page: '2' }))).toBe(0)
    expect(countActiveFilters(parseListingFilters({ town: 'jajce', bedsMin: '2' }))).toBe(2)
  })
})

describe('slavicPlural', () => {
  const oglas = (n: number) => slavicPlural(n, 'oglas', 'oglasa', 'oglasa')

  it('uses the singular for 1', () => {
    expect(oglas(1)).toBe('oglas')
  })

  it('uses the singular for 21, 31, 101 — the trap in a naive count === 1 check', () => {
    expect(oglas(21)).toBe('oglas')
    expect(oglas(31)).toBe('oglas')
    expect(oglas(101)).toBe('oglas')
  })

  it('does NOT use the singular for 11, despite it ending in 1', () => {
    expect(oglas(11)).toBe('oglasa')
  })

  it('handles the 12–14 teens, which also break the last-digit rule', () => {
    for (const n of [12, 13, 14, 112, 113]) expect(oglas(n)).toBe('oglasa')
  })

  it('distinguishes all three forms for a noun where they differ', () => {
    const kuca = (n: number) => slavicPlural(n, 'kuća', 'kuće', 'kuća')
    expect(kuca(1)).toBe('kuća')
    expect(kuca(3)).toBe('kuće')
    expect(kuca(7)).toBe('kuća')
    expect(kuca(0)).toBe('kuća')
  })
})

describe('formatDate', () => {
  /*
   * The point of this function is that it does not vary by machine, so the
   * tests are about determinism rather than about prettiness.
   */
  it('renders the Bosnian convention', () => {
    expect(formatDate('2026-09-17T12:00:00.000Z')).toBe('17.09.2026.')
    expect(formatDate('2026-01-05')).toBe('05.01.2026.')
  })

  it('does not shift the day near midnight, whatever the timezone', () => {
    // toLocaleDateString would answer "17" or "18" here depending on where the
    // machine is. This reads the date the API sent and leaves it alone.
    expect(formatDate('2026-09-17T23:30:00.000Z')).toBe('17.09.2026.')
    expect(formatDate('2026-09-17T00:30:00.000Z')).toBe('17.09.2026.')
  })

  it('hands back anything it does not understand', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('nonsense')).toBe('nonsense')
  })
})

describe('formatPrice', () => {
  /*
   * Intl.NumberFormat('bs-BA') produced "169.000" on the server and "169,000"
   * in a browser without data for the locale — visible on the map, where
   * client-rendered markers disagreed with server-rendered cards on the same
   * screen. These tests pin the format so it cannot drift back.
   */
  it('groups thousands with a dot, the way this market writes it', () => {
    expect(formatPrice(145_000)).toBe('145.000 KM')
    expect(formatPrice(1_250_000)).toBe('1.250.000 KM')
  })

  it('leaves small numbers alone', () => {
    expect(formatPrice(600)).toBe('600 KM')
    expect(formatPrice(0)).toBe('0 KM')
  })
})
