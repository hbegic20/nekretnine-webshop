import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DEFAULT_EXPIRY_DAYS, type ListingDetail } from 'shared'
import { db } from '../db/index.js'
import { listings, payments } from '../db/schema.js'
import { api, type ApiError } from '../test/api.js'
import {
  createAdmin,
  createSeller,
  daysAgo,
  daysFromNow,
  insertListing,
  listingInput,
  publishedListing,
} from '../test/factories.js'

/**
 * The moderation queue is the core of the product (SPEC.md §1), so this file
 * is the one that matters most. Everything here is a rule someone could break
 * by accident in a later refactor and not notice until a listing goes live
 * without approval, or a seller's live listing vanishes for no reason.
 */

interface DetailResponse {
  listing: ListingDetail
}

interface PatchResponse extends DetailResponse {
  returnedToReview: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('the lifecycle, end to end', () => {
  it('carries a listing from draft to live, recording the offline payment', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()

    const created = await seller.client.post<DetailResponse>('/api/listings', listingInput())
    const id = created.body.listing.id
    expect(created.body.listing.status).toBe('DRAFT')

    // It is invisible until an admin has seen it.
    expect((await api().get(`/api/listings/${id}`)).status).toBe(404)

    const submitted = await seller.client.post<DetailResponse>(`/api/listings/${id}/submit`)
    expect(submitted.body.listing.status).toBe('PENDING')
    expect((await api().get(`/api/listings/${id}`)).status).toBe(404)

    const published = await admin.client.post<DetailResponse>(`/api/listings/${id}/publish`, {
      payment: { amount: 40, method: 'gotovina', paidAt: new Date().toISOString(), note: 'Plaćeno u uredu' },
    })

    expect(published.status).toBe(200)
    expect(published.body.listing.status).toBe('PUBLISHED')
    expect(published.body.listing.publishedAt).not.toBeNull()
    expect((await api().get(`/api/listings/${id}`)).status).toBe(200)

    // Money never moves through the app — this row is an admin writing down
    // that a bank transfer or an envelope happened (SPEC.md §1).
    const ledger = await db.select().from(payments).where(eq(payments.listingId, id))
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.amount).toBe(40)
    expect(ledger[0]?.recordedByUserId).toBe(admin.user.id)
  })

  it('defaults the expiry to the shared constant and honours an override', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const byDefault = await insertListing(seller.user.id, { status: 'PENDING' })
    const overridden = await insertListing(seller.user.id, { status: 'PENDING' })

    await admin.client.post(`/api/listings/${byDefault.id}/publish`, {})
    await admin.client.post(`/api/listings/${overridden.id}/publish`, { expiryDays: 30 })

    expect(await daysUntilExpiry(byDefault.id)).toBe(DEFAULT_EXPIRY_DAYS)
    expect(await daysUntilExpiry(overridden.id)).toBe(30)
  })

  it('publishes without a payment when no money changed hands', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await admin.client.post(`/api/listings/${listing.id}/publish`, {})

    expect(response.status).toBe(200)
    // A free renewal or a favour. "They paid nothing" and "we did not charge
    // them" are different facts, and only the first belongs in the ledger.
    expect(await db.select().from(payments).where(eq(payments.listingId, listing.id))).toHaveLength(0)
  })

  it('refuses to write a payment of zero into the ledger', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await admin.client.post<ApiError>(`/api/listings/${listing.id}/publish`, {
      payment: { amount: 0, method: 'gotovina', paidAt: new Date().toISOString() },
    })

    /*
     * "They paid nothing" and "we did not charge them" are different facts,
     * and only the second is true of a free renewal (SPEC.md §4.9). The way to
     * say the second is to omit `payment` entirely — see the test above.
     *
     * The whole request fails rather than publishing without the payment: an
     * admin who typed the wrong amount wants to fix it and try again, not to
     * discover later that the listing went live with no record of the money.
     */
    expect(response.status).toBe(400)
    expect(response.body.error.fields?.map((f) => f.path)).toContain('payment.amount')
    expect(await db.select().from(payments).where(eq(payments.listingId, listing.id))).toHaveLength(0)
    expect(await statusOf(listing.id)).toBe('PENDING')
  })

  it('sets paid placement when the admin sells it, and leaves it off when not', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const plain = await insertListing(seller.user.id, { status: 'PENDING' })
    const promoted = await insertListing(seller.user.id, { status: 'PENDING' })

    await admin.client.post(`/api/listings/${plain.id}/publish`, {})
    await admin.client.post(`/api/listings/${promoted.id}/publish`, {
      featuredDays: 14,
      payment: { amount: 40, method: 'gotovina', paidAt: new Date().toISOString() },
    })

    // Absent means not featured, and that has to be the default: placement is
    // worth something only while most listings do not have it.
    expect(await featuredDaysLeft(plain.id)).toBeNull()
    expect(await featuredDaysLeft(promoted.id)).toBe(14)
  })

  it('keeps placement through a round trip to the queue', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      featuredUntil: daysFromNow(10),
    })

    // The seller edits something that is not the price, which sends it back
    // for review, and the admin approves it again without re-selling placement.
    await seller.client.patch(`/api/listings/${listing.id}`, {
      title: 'Trosoban stan, ažuriran opis i slike',
    })
    await admin.client.post(`/api/listings/${listing.id}/publish`, {})

    // They paid for a fortnight, not for a fortnight minus however long
    // moderation took.
    expect(await featuredDaysLeft(listing.id)).toBe(10)
  })

  it('refuses to let a seller feature their own listing', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await seller.client.post(`/api/listings/${listing.id}/publish`, {
      featuredDays: 30,
    })

    expect(response.status).toBe(403)
    expect(await featuredDaysLeft(listing.id)).toBeNull()
  })

  it('lets a seller renew an expired listing back into the queue', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'EXPIRED' })

    const response = await seller.client.post<DetailResponse>(`/api/listings/${listing.id}/submit`)

    expect(response.body.listing.status).toBe('PENDING')
  })
})

describe('who may move a listing', () => {
  it('refuses to let a seller publish their own listing', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await seller.client.post<ApiError>(`/api/listings/${listing.id}/publish`, {})

    expect(response.status).toBe(403)
    expect(await statusOf(listing.id)).toBe('PENDING')
  })

  it('refuses to let a seller reject a listing', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await seller.client.post(`/api/listings/${listing.id}/reject`, {
      reason: 'Ne sviđa mi se',
    })

    expect(response.status).toBe(403)
  })

  it('refuses to let one seller submit another seller’s draft', async () => {
    const seller = await createSeller()
    const stranger = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'DRAFT' })

    expect((await stranger.client.post(`/api/listings/${listing.id}/submit`)).status).toBe(404)
    expect(await statusOf(listing.id)).toBe('DRAFT')
  })

  it('refuses an anonymous caller outright', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    expect((await api().post(`/api/listings/${listing.id}/publish`, {})).status).toBe(401)
  })
})

describe('illegal transitions', () => {
  it('will not publish something that was never submitted', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const draft = await insertListing(seller.user.id, { status: 'DRAFT' })

    const response = await admin.client.post<ApiError>(`/api/listings/${draft.id}/publish`, {})

    // Checked against ALLOWED_TRANSITIONS in /shared, so the state machine has
    // one definition that the UI reads too.
    expect(response.status).toBe(400)
    expect(await statusOf(draft.id)).toBe('DRAFT')
  })

  it('will not mark a draft sold', async () => {
    const seller = await createSeller()
    const draft = await insertListing(seller.user.id, { status: 'DRAFT' })

    expect((await seller.client.post(`/api/listings/${draft.id}/sold`)).status).toBe(400)
  })

  it('treats SOLD as the end of the line', async () => {
    const seller = await createSeller()
    const sold = await insertListing(seller.user.id, { status: 'SOLD', soldAt: new Date() })

    expect((await seller.client.post(`/api/listings/${sold.id}/submit`)).status).toBe(400)
    expect((await seller.client.post(`/api/listings/${sold.id}/sold`)).status).toBe(400)
  })
})

describe('featuring a listing that is already live', () => {
  it('lets an admin start placement without republishing', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id, { publishedAt: daysAgo(7) })

    const response = await admin.client.post(`/api/listings/${listing.id}/feature`, { days: 14 })

    expect(response.status).toBe(200)
    expect(await featuredDaysLeft(listing.id)).toBe(14)

    /*
     * The listing keeps its place in "newest". Before this endpoint the only
     * way to feature something already live was to take it down and publish it
     * again, which resets published_at — a punishing way to sell an upgrade.
     */
    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(Math.round((Date.now() - (row?.publishedAt?.getTime() ?? 0)) / DAY_MS)).toBe(7)
    expect(row?.status).toBe('PUBLISHED')
  })

  it('lets an admin end it, and tells "never" apart from "expired"', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id, { featuredUntil: daysFromNow(20) })

    const response = await admin.client.delete(`/api/listings/${listing.id}/feature`)

    expect(response.status).toBe(200)
    // Cleared, not backdated: "featured until yesterday" and "never featured"
    // are different facts, and only one is true after a refund.
    const [row] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(row?.featuredUntil).toBeNull()
  })

  it('refuses on a listing the public cannot see', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const draft = await insertListing(seller.user.id, { status: 'DRAFT' })

    const response = await admin.client.post<ApiError>(`/api/listings/${draft.id}/feature`, {
      days: 14,
    })

    // An admin featuring a draft has almost certainly mistaken it for the
    // published one — worth refusing rather than taking money for placement
    // nobody can see.
    expect(response.status).toBe(400)
    expect(await featuredDaysLeft(draft.id)).toBeNull()
  })

  it('is closed to sellers, including for their own listing', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    expect((await seller.client.post(`/api/listings/${listing.id}/feature`, { days: 30 })).status).toBe(403)
    expect((await seller.client.delete(`/api/listings/${listing.id}/feature`)).status).toBe(403)
    expect((await api().delete(`/api/listings/${listing.id}/feature`)).status).toBe(401)
    expect(await featuredDaysLeft(listing.id)).toBeNull()
  })
})

describe('rejection', () => {
  it('requires a reason the seller can act on', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const noReason = await admin.client.post<ApiError>(`/api/listings/${listing.id}/reject`, {})
    const tooShort = await admin.client.post<ApiError>(`/api/listings/${listing.id}/reject`, {
      reason: 'ne',
    })

    expect(noReason.status).toBe(400)
    expect(tooShort.status).toBe(400)
    expect(await statusOf(listing.id)).toBe('PENDING')
  })

  it('stores the reason and shows it to the seller alone', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await insertListing(seller.user.id, { status: 'PENDING' })

    const response = await admin.client.post<DetailResponse>(`/api/listings/${listing.id}/reject`, {
      reason: 'Slike ne prikazuju nekretninu',
    })

    expect(response.body.listing.status).toBe('REJECTED')

    const owner = await seller.client.get<DetailResponse>(`/api/listings/${listing.id}`)
    expect(owner.body.listing.rejectionReason).toBe('Slike ne prikazuju nekretninu')
  })

  it('is also how an admin takes a live listing down', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id)

    const response = await admin.client.post(`/api/listings/${listing.id}/reject`, {
      reason: 'Nekretnina je već prodana preko druge agencije',
    })

    // REJECTED rather than a status of its own, because the recovery path is
    // identical: the seller edits, which moves it to DRAFT, and resubmits.
    expect(response.status).toBe(200)
    expect(await statusOf(listing.id)).toBe('REJECTED')
    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(404)
  })
})

describe('editing a live listing', () => {
  it('keeps it live when only the price changed', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id, { price: 145_000 })

    const response = await seller.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      price: 139_000,
    })

    // Price cuts are the most common edit by a wide margin, and making them
    // wait for approval would be genuinely annoying (SPEC.md §3).
    expect(response.body.listing.status).toBe('PUBLISHED')
    expect(response.body.returnedToReview).toBe(false)
    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(200)
  })

  it('sends it back to the queue when anything else changed', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await seller.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      title: 'Potpuno drugačiji oglas o zemljištu',
    })

    // Closes the bait-and-switch: get a clean listing approved, then rewrite it.
    expect(response.body.listing.status).toBe('PENDING')
    // The UI needs this to explain what just happened, rather than leaving the
    // seller to notice their listing vanished from the site.
    expect(response.body.returnedToReview).toBe(true)
    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(404)
  })

  it('does not re-moderate a listing that was saved without changing anything', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await seller.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      title: listing.title,
      price: listing.price,
      description: listing.description,
    })

    // Comparing values rather than counting fields sent: an edit form posts
    // every field on every save, and treating that as "everything changed"
    // would pull a listing off the site for a re-save that changed nothing.
    expect(response.body.listing.status).toBe('PUBLISHED')
    expect(response.body.returnedToReview).toBe(false)
  })

  it('does not smuggle a default description into a price-only edit', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id, {
      description: 'Prostran stan blizu škole i prodavnice.',
    })

    const response = await seller.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      price: 139_000,
    })

    /*
     * A regression guard, not a hypothetical. `description` once carried
     * `.default('')` on the shared schema, and `.partial()` keeps a default
     * while making the field optional — so every PATCH arrived carrying
     * `description: ''`, the service saw a change, and a seller cutting their
     * price watched their listing drop off the site.
     */
    expect(response.body.listing.status).toBe('PUBLISHED')
    expect(response.body.listing.description).toBe('Prostran stan blizu škole i prodavnice.')
  })

  it('lets an admin edit a live listing without unpublishing it', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id)

    const response = await admin.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      title: 'Uredio administrator radi jasnoće',
    })

    // An admin editing a live listing is moderation, not an end-run around it.
    expect(response.body.listing.status).toBe('PUBLISHED')
    expect(response.body.returnedToReview).toBe(false)
  })
})

describe('editing after a rejection', () => {
  it('moves the listing to DRAFT and clears the old reason', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'REJECTED',
      rejectionReason: 'Slike ne prikazuju nekretninu',
    })

    const response = await seller.client.patch<PatchResponse>(`/api/listings/${listing.id}`, {
      title: 'Trosoban stan, nove slike i opis',
    })

    // DRAFT rather than straight back to PENDING, so the seller resubmits
    // deliberately rather than by accident — and a fresh review starts without
    // the previous rejection note attached.
    expect(response.body.listing.status).toBe('DRAFT')
    expect(response.body.listing.rejectionReason).toBeNull()
  })
})

describe('a sold listing', () => {
  it('is marked sold by its owner and then frozen', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const sold = await seller.client.post<DetailResponse>(`/api/listings/${listing.id}/sold`)
    expect(sold.body.listing.status).toBe('SOLD')
    expect(sold.body.listing.soldAt).not.toBeNull()

    const edit = await seller.client.patch<ApiError>(`/api/listings/${listing.id}`, { price: 1 })
    expect(edit.status).toBe(400)
  })

  it('still opens at its own URL', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, { status: 'SOLD', soldAt: new Date() })

    // Links get shared, and sold listings are the only price history this
    // market has (SPEC.md §3).
    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(200)
  })
})

async function statusOf(id: string): Promise<string | undefined> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id))
  return row?.status
}

/** Whole days of paid placement left, or null when there is none. */
async function featuredDaysLeft(id: string): Promise<number | null> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id))
  if (!row?.featuredUntil) return null
  return Math.round((row.featuredUntil.getTime() - Date.now()) / DAY_MS)
}

async function daysUntilExpiry(id: string): Promise<number> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id))
  if (!row?.expiresAt) throw new Error('listing has no expiry')
  return Math.round((row.expiresAt.getTime() - Date.now()) / DAY_MS)
}
