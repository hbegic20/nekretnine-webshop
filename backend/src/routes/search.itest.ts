import { describe, expect, it } from 'vitest'
import { LISTINGS_PER_PAGE, type MapPin, type Paginated, type ListingSummary } from 'shared'
import { api } from '../test/api.js'
import { createSeller, daysAgo, insertListing, publishedListing } from '../test/factories.js'
import type { User } from '../db/schema.js'

/**
 * Search over the real database, which is the only place it can be tested.
 *
 * The unit test next to `listing-filters.ts` covers parsing a URL into a
 * filter object. What it cannot cover is what those filters do once they reach
 * Postgres: whether NULLs drop out of a range, whether the full-text index
 * matches text typed without diacritics, whether two listings at the same
 * price keep a stable order across pages. All of that is SQL behaviour.
 */

type Page = Paginated<ListingSummary>

async function seller(): Promise<User> {
  return (await createSeller()).user
}

describe('what the public can browse', () => {
  it('returns published listings and nothing else', async () => {
    const owner = await seller()
    const live = await publishedListing(owner.id, { title: 'Stan koji je objavljen' })
    await insertListing(owner.id, { status: 'DRAFT' })
    await insertListing(owner.id, { status: 'PENDING' })
    await insertListing(owner.id, { status: 'REJECTED' })
    await insertListing(owner.id, { status: 'EXPIRED' })

    const response = await api().get<Page>('/api/listings')

    // Enforced in the API, not in the UI (SPEC.md §3).
    expect(response.body.total).toBe(1)
    expect(response.body.items[0]?.id).toBe(live.id)
  })

  it('drops a soft-deleted listing out of the results', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { deletedAt: new Date() })

    expect((await api().get<Page>('/api/listings')).body.total).toBe(0)
  })

  it('paginates, keeping a stable order when prices tie', async () => {
    const owner = await seller()
    const total = LISTINGS_PER_PAGE + 3
    for (let i = 0; i < total; i += 1) {
      await publishedListing(owner.id, { price: 100_000, publishedAt: daysAgo(1) })
    }

    const first = await api().get<Page>('/api/listings?sort=price_asc')
    const second = await api().get<Page>('/api/listings?page=2&sort=price_asc')

    expect(first.body.total).toBe(total)
    expect(first.body.perPage).toBe(LISTINGS_PER_PAGE)
    expect(first.body.items).toHaveLength(LISTINGS_PER_PAGE)
    expect(second.body.items).toHaveLength(3)

    /*
     * The point of this test. Without the id tiebreaker in the ORDER BY,
     * identically priced rows have no defined order and Postgres may return
     * them differently per query — which shows up as a listing appearing on
     * both pages, or on neither.
     */
    const ids = [...first.body.items, ...second.body.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(total)
  })
})

describe('filters', () => {
  it('filters by town', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { town: 'bugojno' })
    await publishedListing(owner.id, { town: 'jajce' })

    const response = await api().get<Page>('/api/listings?town=jajce')

    expect(response.body.total).toBe(1)
    expect(response.body.items[0]?.town).toBe('jajce')
  })

  it('filters by property and transaction type together', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { propertyType: 'house', transactionType: 'sale' })
    await publishedListing(owner.id, { propertyType: 'apartment', transactionType: 'rent' })
    await publishedListing(owner.id, { propertyType: 'apartment', transactionType: 'sale' })

    const response = await api().get<Page>('/api/listings?propertyType=apartment&transactionType=rent')

    expect(response.body.total).toBe(1)
  })

  it('filters on an inclusive price range', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { price: 90_000 })
    await publishedListing(owner.id, { price: 100_000 })
    await publishedListing(owner.id, { price: 150_000 })

    const response = await api().get<Page>('/api/listings?priceMin=100000&priceMax=150000')

    expect(response.body.total).toBe(2)
  })

  it('reads a backwards price range as the range the person meant', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { price: 100_000 })

    const response = await api().get<Page>('/api/listings?priceMin=200000&priceMax=50000')

    // Someone typing 200000–50000 means the range, not an empty result.
    expect(response.body.total).toBe(1)
  })

  it('excludes a listing whose bedroom count was never recorded', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { bedrooms: 3 })
    await publishedListing(owner.id, { bedrooms: null })

    const response = await api().get<Page>('/api/listings?bedsMin=2')

    /*
     * `bedrooms >= 2` is NULL for a listing that never said, and NULL is not
     * true, so it drops out. That is right — someone asking for two bedrooms
     * should not be shown one that might have none — but it means incomplete
     * listings become invisible the moment a buyer filters, which is worth
     * knowing rather than discovering.
     */
    expect(response.body.total).toBe(1)
  })

  it('ignores a filter value it does not recognise instead of erroring', async () => {
    const owner = await seller()
    await publishedListing(owner.id)

    const response = await api().get<Page>('/api/listings?town=atlantis&propertyType=castle&page=abc')

    // A search URL gets hand-edited, shared in chat apps and mangled by link
    // previewers. It should degrade to unfiltered results, never 400.
    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
  })
})

describe('keyword search', () => {
  it('matches a word from the title', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { title: 'Građevinsko zemljište pored rijeke' })
    await publishedListing(owner.id, { title: 'Trosoban stan u centru' })

    const response = await api().get<Page>('/api/listings?q=zemljište')

    expect(response.body.total).toBe(1)
  })

  it('matches text typed without diacritics, and the other way round', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { title: 'Kuća sa okućnicom u Gornjem Vakufu' })

    const withoutDiacritics = await api().get<Page>('/api/listings?q=kuca')
    const withDiacritics = await api().get<Page>('/api/listings?q=kuća')

    // f_unaccent is applied to the indexed text and to the search term, so
    // both sides are stripped. Most phones here type on an English keyboard,
    // which makes this the common case rather than the edge case.
    expect(withoutDiacritics.body.total).toBe(1)
    expect(withDiacritics.body.total).toBe(1)
  })

  it('searches the description and the neighbourhood too', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { description: 'Blizu osnovne škole i pijace.' })
    await publishedListing(owner.id, { neighbourhood: 'Vrbanja', description: 'Nema opisa.' })

    expect((await api().get<Page>('/api/listings?q=pijace')).body.total).toBe(1)
    expect((await api().get<Page>('/api/listings?q=vrbanja')).body.total).toBe(1)
  })

  it('survives punctuation that would break a raw tsquery', async () => {
    const owner = await seller()
    await publishedListing(owner.id)

    for (const q of ["don't", 'stan & kuća', 'a | b', '!!!', '(']) {
      const response = await api().get<Page>(`/api/listings?q=${encodeURIComponent(q)}`)
      // plainto_tsquery treats the input as text rather than operator syntax.
      // A search box must never 500 because somebody typed an apostrophe.
      expect(response.status).toBe(200)
    }
  })
})

describe('sorting', () => {
  it('sorts by price, ascending and descending', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { price: 150_000 })
    await publishedListing(owner.id, { price: 90_000 })
    await publishedListing(owner.id, { price: 120_000 })

    const ascending = await api().get<Page>('/api/listings?sort=price_asc')
    const descending = await api().get<Page>('/api/listings?sort=price_desc')

    expect(ascending.body.items.map((i) => i.price)).toEqual([90_000, 120_000, 150_000])
    expect(descending.body.items.map((i) => i.price)).toEqual([150_000, 120_000, 90_000])
  })

  it('defaults to newest, by publication date rather than creation date', async () => {
    const owner = await seller()
    const old = await publishedListing(owner.id, { publishedAt: daysAgo(10) })
    const recent = await publishedListing(owner.id, { publishedAt: daysAgo(1) })

    const response = await api().get<Page>('/api/listings')

    expect(response.body.items.map((i) => i.id)).toEqual([recent.id, old.id])
  })
})

describe('sold listings', () => {
  it('are left out of browse results by default', async () => {
    const owner = await seller()
    await publishedListing(owner.id)
    await insertListing(owner.id, { status: 'SOLD', soldAt: new Date() })

    // Someone looking for a flat to buy does not want a page of ones they
    // cannot have.
    expect((await api().get<Page>('/api/listings')).body.total).toBe(1)
  })

  it('come last when asked for, whatever the sort', async () => {
    const owner = await seller()
    const sold = await insertListing(owner.id, {
      status: 'SOLD',
      soldAt: new Date(),
      price: 50_000,
    })
    const available = await publishedListing(owner.id, { price: 150_000 })

    const response = await api().get<Page>('/api/listings?includeSold=1&sort=price_asc')

    // Cheapest first would normally put the sold one at the top; "sold sorts
    // last whatever else is chosen" (SPEC.md §3) wins over the chosen sort.
    expect(response.body.total).toBe(2)
    expect(response.body.items.map((i) => i.id)).toEqual([available.id, sold.id])
  })
})

describe('GET /api/listings/map', () => {
  it('returns a pin per matching listing, unpaginated', async () => {
    const owner = await seller()
    for (let i = 0; i < LISTINGS_PER_PAGE + 2; i += 1) {
      await publishedListing(owner.id)
    }

    const response = await api().get<{ pins: MapPin[] }>('/api/listings/map')

    // A map showing page 1 of the pins is worse than no map — the spread
    // across the region is the information.
    expect(response.body.pins).toHaveLength(LISTINGS_PER_PAGE + 2)
  })

  it('leaves out listings with no coordinates rather than placing them at zero', async () => {
    const owner = await seller()
    await publishedListing(owner.id)
    await publishedListing(owner.id, { lat: null, lng: null })

    const response = await api().get<{ pins: MapPin[] }>('/api/listings/map')

    expect(response.body.pins).toHaveLength(1)
  })

  it('applies the same filters as the list', async () => {
    const owner = await seller()
    await publishedListing(owner.id, { town: 'bugojno' })
    await publishedListing(owner.id, { town: 'travnik' })

    const response = await api().get<{ pins: MapPin[] }>('/api/listings/map?town=travnik')

    expect(response.body.pins).toHaveLength(1)
  })
})
