import { describe, expect, it } from 'vitest'
import type {
  AdminListingDetail,
  AdminListingSummary,
  ListingStatusCounts,
  Paginated,
} from 'shared'
import { api } from '../test/api.js'
import {
  createAdmin,
  createSeller,
  daysAgo,
  insertListing,
  publishedListing,
} from '../test/factories.js'

interface QueueResponse extends Paginated<AdminListingSummary> {
  counts: ListingStatusCounts
}

describe('who can reach /api/admin', () => {
  it('turns away a signed-out caller and a signed-in seller', async () => {
    await createSeller()
    const seller = await createSeller()

    expect((await api().get('/api/admin/listings')).status).toBe(401)
    expect((await seller.client.get('/api/admin/listings')).status).toBe(403)
  })
})

describe('GET /api/admin/listings', () => {
  it('works the pending queue oldest first', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const waitingLongest = await insertListing(seller.user.id, {
      status: 'PENDING',
      updatedAt: daysAgo(3),
    })
    const waitingLeast = await insertListing(seller.user.id, {
      status: 'PENDING',
      updatedAt: daysAgo(1),
    })

    const response = await admin.client.get<QueueResponse>('/api/admin/listings?status=PENDING')

    /*
     * The opposite of every other list in the app, and deliberate: a queue is
     * worked from the front. Newest-first would leave whoever submitted three
     * days ago waiting behind everyone who has submitted since.
     */
    expect(response.body.items.map((i) => i.id)).toEqual([waitingLongest.id, waitingLeast.id])
  })

  it('shows every other tab newest first', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const older = await publishedListing(seller.user.id, { updatedAt: daysAgo(3) })
    const newer = await publishedListing(seller.user.id, { updatedAt: daysAgo(1) })

    const response = await admin.client.get<QueueResponse>('/api/admin/listings?status=PUBLISHED')

    expect(response.body.items.map((i) => i.id)).toEqual([newer.id, older.id])
  })

  it('counts every status, including the ones at zero', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    await insertListing(seller.user.id, { status: 'PENDING' })
    await insertListing(seller.user.id, { status: 'PENDING' })
    await publishedListing(seller.user.id)

    const response = await admin.client.get<QueueResponse>('/api/admin/listings')

    expect(response.body.counts.PENDING).toBe(2)
    expect(response.body.counts.PUBLISHED).toBe(1)
    // Zero-filled rather than absent: a tab rendering "undefined" instead of
    // "0" makes a dashboard look broken.
    expect(response.body.counts.SOLD).toBe(0)
  })

  it('leaves deleted listings out of both the list and the counts', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    await publishedListing(seller.user.id, { deletedAt: new Date() })

    const response = await admin.client.get<QueueResponse>('/api/admin/listings')

    expect(response.body.total).toBe(0)
    expect(response.body.counts.PUBLISHED).toBe(0)
  })

  it('carries the owner’s contact details on each row', async () => {
    const seller = await createSeller({ name: 'Amir Prodavac', email: 'amir@nekretnine.test' })
    const admin = await createAdmin()
    await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await admin.client.get<QueueResponse>('/api/admin/listings?status=PENDING')

    expect(response.body.items[0]?.owner.email).toBe('amir@nekretnine.test')
    expect(response.body.items[0]?.owner.name).toBe('Amir Prodavac')
  })
})

describe('GET /api/admin/listings/:id', () => {
  it('shows the listing as a buyer sees it, plus the evidence behind it', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const buyer = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PENDING',
      address: 'Sultan Ahmedova 12',
    })

    await admin.client.post(`/api/listings/${listing.id}/publish`, {
      payment: { amount: 40, method: 'bankovni prijenos', paidAt: new Date().toISOString() },
    })
    await buyer.client.put(`/api/favorites/${listing.id}`)
    await api().post(`/api/listings/${listing.id}/inquiries`, {
      name: 'Selma Kupac',
      email: 'selma@primjer.test',
      message: 'Da li je stan još uvijek dostupan za obilazak?',
    })

    const response = await admin.client.get<{ listing: AdminListingDetail }>(
      `/api/admin/listings/${listing.id}`,
    )

    expect(response.status).toBe(200)
    // Reviewing anything less than what a buyer sees means approving something
    // you have not actually looked at (SPEC.md §4.9).
    expect(response.body.listing.address).toBe('Sultan Ahmedova 12')
    expect(response.body.listing.owner.id).toBe(seller.user.id)
    expect(response.body.listing.payments).toHaveLength(1)
    expect(response.body.listing.payments[0]?.amount).toBe(40)
    // The closest thing to evidence the queue has, and worth a glance before
    // taking something down.
    expect(response.body.listing.inquiryCount).toBe(1)
    expect(response.body.listing.favoriteCount).toBe(1)
  })

  it('404s for a deleted listing and for one that never existed', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const deleted = await publishedListing(seller.user.id, { deletedAt: new Date() })

    expect((await admin.client.get(`/api/admin/listings/${deleted.id}`)).status).toBe(404)
    expect(
      (await admin.client.get('/api/admin/listings/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404)
  })
})
