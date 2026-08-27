import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FavoriteListing, ListingDetail, ListingSummary, Paginated } from 'shared'
import { db } from '../db/index.js'
import { listings } from '../db/schema.js'
import { api } from '../test/api.js'
import { createSeller, insertListing, publishedListing } from '../test/factories.js'

interface FavoritesResponse {
  items: FavoriteListing[]
}

describe('saving a listing', () => {
  it('is idempotent — saving twice leaves one saved listing, not an error', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const listing = await publishedListing(owner.user.id)

    const first = await buyer.client.put(`/api/favorites/${listing.id}`)
    const second = await buyer.client.put(`/api/favorites/${listing.id}`)

    // PUT, not POST, precisely so a double click or a retry on a flaky phone
    // connection ends with the listing saved and no error (SPEC.md §4.6).
    expect(first.status).toBe(204)
    expect(second.status).toBe(204)

    const saved = await buyer.client.get<FavoritesResponse>('/api/favorites')
    expect(saved.body.items).toHaveLength(1)
  })

  it('unsaves, and unsaving something never saved is still a success', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const listing = await publishedListing(owner.user.id)

    await buyer.client.put(`/api/favorites/${listing.id}`)
    expect((await buyer.client.delete(`/api/favorites/${listing.id}`)).status).toBe(204)
    expect((await buyer.client.delete(`/api/favorites/${listing.id}`)).status).toBe(204)

    expect((await buyer.client.get<FavoritesResponse>('/api/favorites')).body.items).toHaveLength(0)
  })

  it('refuses to save something the public cannot see', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const draft = await insertListing(owner.user.id, { status: 'DRAFT' })

    // Otherwise this endpoint would confirm which draft ids exist, by
    // succeeding on the real ones and 404ing on the rest.
    expect((await buyer.client.put(`/api/favorites/${draft.id}`)).status).toBe(404)
  })

  it('needs an account — this is the only reason a buyer has one', async () => {
    const owner = await createSeller()
    const listing = await publishedListing(owner.user.id)
    const anonymous = api()

    expect((await anonymous.get('/api/favorites')).status).toBe(401)
    expect((await anonymous.put(`/api/favorites/${listing.id}`)).status).toBe(401)
    expect((await anonymous.delete(`/api/favorites/${listing.id}`)).status).toBe(401)
  })
})

describe('the saved list', () => {
  it('keeps a listing that has since expired, marked unavailable', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const live = await publishedListing(owner.user.id)
    const expired = await publishedListing(owner.user.id)

    await buyer.client.put(`/api/favorites/${live.id}`)
    await buyer.client.put(`/api/favorites/${expired.id}`)
    await insertListing(owner.user.id, {}) // noise
    await expire(expired.id)

    const saved = await buyer.client.get<FavoritesResponse>('/api/favorites')

    // Removing it silently would leave someone certain they had saved a flat
    // that has since vanished (SPEC.md §4.6).
    expect(saved.body.items).toHaveLength(2)
    expect(saved.body.items.find((i) => i.id === expired.id)?.available).toBe(false)
    expect(saved.body.items.find((i) => i.id === live.id)?.available).toBe(true)
  })

  it('drops a listing that was deleted, because there is no page to link to', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const listing = await publishedListing(owner.user.id)

    await buyer.client.put(`/api/favorites/${listing.id}`)
    await owner.client.delete(`/api/listings/${listing.id}`)

    expect((await buyer.client.get<FavoritesResponse>('/api/favorites')).body.items).toHaveLength(0)
  })
})

describe('the isFavorite flag', () => {
  it('is absent for a visitor and present for someone signed in', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const saved = await publishedListing(owner.user.id)
    const notSaved = await publishedListing(owner.user.id)
    await buyer.client.put(`/api/favorites/${saved.id}`)

    const anonymous = await api().get<Paginated<ListingSummary>>('/api/listings')
    const signedIn = await buyer.client.get<Paginated<ListingSummary>>('/api/listings')

    /*
     * Absent rather than false for a visitor, and the distinction is load
     * bearing: `false` means "you have not saved this", which is a different
     * claim from "there is nobody to have saved it". The UI reads the absence
     * to decide whether to render a save button at all.
     */
    expect(anonymous.body.items.every((i) => i.isFavorite === undefined)).toBe(true)
    expect(signedIn.body.items.find((i) => i.id === saved.id)?.isFavorite).toBe(true)
    expect(signedIn.body.items.find((i) => i.id === notSaved.id)?.isFavorite).toBe(false)
  })

  it('comes back on the detail page too, without a second request', async () => {
    const buyer = await createSeller()
    const owner = await createSeller()
    const listing = await publishedListing(owner.user.id)
    await buyer.client.put(`/api/favorites/${listing.id}`)

    const response = await buyer.client.get<{ listing: ListingDetail }>(`/api/listings/${listing.id}`)

    expect(response.body.listing.isFavorite).toBe(true)
  })
})

/** Straight to EXPIRED, the way the scheduled job leaves it. */
async function expire(listingId: string): Promise<void> {
  await db.update(listings).set({ status: 'EXPIRED' }).where(eq(listings.id, listingId))
}
