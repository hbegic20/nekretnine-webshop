import { describe, expect, it } from 'vitest'
import type { ListingDetail, ListingSummary } from 'shared'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { listings } from '../db/schema.js'
import { api, type ApiError } from '../test/api.js'
import {
  createAdmin,
  createSeller,
  insertListing,
  listingInput,
  publishedListing,
} from '../test/factories.js'

interface DetailResponse {
  listing: ListingDetail
}

interface MineResponse {
  items: ListingSummary[]
}

describe('POST /api/listings', () => {
  it('creates a DRAFT owned by the caller', async () => {
    const seller = await createSeller()

    const response = await seller.client.post<DetailResponse>('/api/listings', listingInput())

    expect(response.status).toBe(201)
    // Nothing a seller submits is ever born public — SPEC.md §3.
    expect(response.body.listing.status).toBe('DRAFT')

    const [row] = await db.select().from(listings).where(eq(listings.id, response.body.listing.id))
    expect(row?.ownerId).toBe(seller.user.id)
  })

  it('refuses an anonymous caller', async () => {
    const response = await api().post<ApiError>('/api/listings', listingInput())

    expect(response.status).toBe(401)
  })

  it.each([
    ['a title under ten characters', { title: 'Stan' }, 'title'],
    ['a fractional price', { price: 145_000.5 }, 'price'],
    ['a town that is not one of the seven', { town: 'sarajevo' }, 'town'],
    ['an unknown property type', { propertyType: 'castle' }, 'propertyType'],
    ['a phone number too short to be one', { contactPhone: '061' }, 'contactPhone'],
  ])('rejects %s', async (_label, override, field) => {
    const seller = await createSeller()

    const response = await seller.client.post<ApiError>('/api/listings', {
      ...listingInput(),
      ...override,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.fields?.map((f) => f.path)).toContain(field)
  })

  it('rejects a latitude with no longitude', async () => {
    const seller = await createSeller()

    const response = await seller.client.post<ApiError>('/api/listings', {
      ...listingInput(),
      lng: null,
    })

    // Half a coordinate is not half-placed, it is unplaceable — the marker
    // would land at longitude 0, in the Gulf of Guinea.
    expect(response.status).toBe(400)
    expect(response.body.error.fields?.map((f) => f.path)).toContain('lng')
  })

  it('rejects a pin dropped outside the region', async () => {
    const seller = await createSeller()

    const response = await seller.client.post<ApiError>('/api/listings', {
      ...listingInput(),
      lat: 45.815, // Zagreb
      lng: 15.982,
    })

    expect(response.status).toBe(400)
  })

  it('accepts a listing with no coordinates at all', async () => {
    const seller = await createSeller()

    const response = await seller.client.post<DetailResponse>('/api/listings', {
      ...listingInput(),
      lat: null,
      lng: null,
    })

    // Not every seller drops a pin, and refusing the listing over it would be
    // worse than leaving it off the map.
    expect(response.status).toBe(201)
    expect(response.body.listing.lat).toBeNull()
  })
})

describe('GET /api/listings/:id', () => {
  it('hides a draft from everyone but its owner and an admin', async () => {
    const seller = await createSeller()
    const stranger = await createSeller()
    const admin = await createAdmin()
    const draft = await insertListing(seller.user.id, { status: 'DRAFT' })

    expect((await api().get(`/api/listings/${draft.id}`)).status).toBe(404)
    expect((await stranger.client.get(`/api/listings/${draft.id}`)).status).toBe(404)
    expect((await seller.client.get(`/api/listings/${draft.id}`)).status).toBe(200)
    expect((await admin.client.get(`/api/listings/${draft.id}`)).status).toBe(200)
  })

  it('answers 404, not 403, for a listing the caller may not see', async () => {
    const seller = await createSeller()
    const stranger = await createSeller()
    const draft = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await stranger.client.get<ApiError>(`/api/listings/${draft.id}`)

    // A 403 would confirm that a listing with this id exists (SPEC.md §4.2),
    // which is more than a stranger needs to know.
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('not_found')
  })

  it('shows a published listing to anyone', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await api().get<DetailResponse>(`/api/listings/${listing.id}`)

    expect(response.status).toBe(200)
    expect(response.body.listing.id).toBe(listing.id)
  })

  it('withholds the street address from the public but shows it to the owner', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id, { address: 'Sultan Ahmedova 12' })

    const anonymous = await api().get<DetailResponse>(`/api/listings/${listing.id}`)
    const owner = await seller.client.get<DetailResponse>(`/api/listings/${listing.id}`)

    // SPEC.md §4.2: town, neighbourhood and a pin are enough to find a
    // property; the exact address is for someone who has made contact.
    expect(anonymous.body.listing.address).toBeNull()
    expect(owner.body.listing.address).toBe('Sultan Ahmedova 12')
  })

  it('keeps the rejection reason between the admin and the seller', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      rejectionReason: 'Slike ne prikazuju nekretninu',
    })

    const anonymous = await api().get<DetailResponse>(`/api/listings/${listing.id}`)
    const owner = await seller.client.get<DetailResponse>(`/api/listings/${listing.id}`)

    expect(anonymous.body.listing.rejectionReason).toBeNull()
    expect(owner.body.listing.rejectionReason).toBe('Slike ne prikazuju nekretninu')
  })

  it('400s on an id that is not a uuid instead of looking it up', async () => {
    const response = await api().get<ApiError>('/api/listings/not-a-uuid')

    expect(response.status).toBe(400)
  })

  it('404s on a well-formed id that does not exist', async () => {
    const response = await api().get('/api/listings/00000000-0000-4000-8000-000000000000')

    expect(response.status).toBe(404)
  })
})

describe('GET /api/listings/mine', () => {
  it('returns the seller their own listings in every status', async () => {
    const seller = await createSeller()
    const other = await createSeller()
    await insertListing(seller.user.id, { status: 'DRAFT' })
    await insertListing(seller.user.id, { status: 'PENDING' })
    await publishedListing(seller.user.id)
    await publishedListing(other.user.id)

    const response = await seller.client.get<MineResponse>('/api/listings/mine')

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(3)
    expect(response.body.items.map((i) => i.status).sort()).toEqual([
      'DRAFT',
      'PENDING',
      'PUBLISHED',
    ])
  })

  it('is not reachable without signing in', async () => {
    expect((await api().get('/api/listings/mine')).status).toBe(401)
  })
})

describe('PATCH /api/listings/:id', () => {
  it('updates the fields sent and leaves the rest alone', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'DRAFT', price: 145_000 })

    const response = await seller.client.patch<DetailResponse>(`/api/listings/${listing.id}`, {
      price: 139_000,
    })

    expect(response.status).toBe(200)
    expect(response.body.listing.price).toBe(139_000)
    expect(response.body.listing.title).toBe(listing.title)
  })

  it('refuses an edit from someone who does not own it, without confirming it exists', async () => {
    const seller = await createSeller()
    const stranger = await createSeller()
    const listing = await publishedListing(seller.user.id, { price: 145_000 })

    const response = await stranger.client.patch<ApiError>(`/api/listings/${listing.id}`, {
      price: 1,
    })

    expect(response.status).toBe(404)

    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(row?.price).toBe(145_000)
  })
})

describe('DELETE /api/listings/:id', () => {
  it('soft-deletes: the row survives, the listing disappears', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await seller.client.delete(`/api/listings/${listing.id}`)
    expect(response.status).toBe(204)

    // The row is still there — its payments and inquiry history hang off it,
    // and losing financial records to a misclick is not a trade worth making.
    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(row).toBeDefined()
    expect(row?.deletedAt).not.toBeNull()

    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(404)
    expect((await seller.client.get(`/api/listings/${listing.id}`)).status).toBe(404)

    const mine = await seller.client.get<MineResponse>('/api/listings/mine')
    expect(mine.body.items).toHaveLength(0)
  })

  it('refuses a delete from someone who does not own it', async () => {
    const seller = await createSeller()
    const stranger = await createSeller()
    const listing = await publishedListing(seller.user.id)

    expect((await stranger.client.delete(`/api/listings/${listing.id}`)).status).toBe(404)

    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(row?.deletedAt).toBeNull()
  })

  it('lets an admin delete a listing they do not own', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id)

    expect((await admin.client.delete(`/api/listings/${listing.id}`)).status).toBe(204)
  })
})
