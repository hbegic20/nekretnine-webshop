import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { ListingSummary, Paginated } from 'shared'
import { db } from '../db/index.js'
import { listings } from '../db/schema.js'
import { api } from '../test/api.js'
import { createSeller, daysAgo, daysFromNow, insertListing } from '../test/factories.js'
import { mailTo, outbox } from '../test/mailbox.js'
import { expireDueListings } from './expiry.js'

/**
 * Until this job existed, `expires_at` was decoration: an admin set it on
 * approval and nothing ever read it, so listings stayed live forever. The
 * whole paid-listing model depends on a listing actually coming down.
 */

describe('expireDueListings', () => {
  it('takes down a listing whose date has passed and tells the seller', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      title: 'Trosoban stan u centru Bugojna',
      contactEmail: 'prodavac@nekretnine.test',
      publishedAt: daysAgo(61),
      expiresAt: daysAgo(1),
    })

    const result = await expireDueListings()

    expect(result).toEqual({ expired: 1, notified: 1 })
    expect(await statusOf(listing.id)).toBe('EXPIRED')

    // The point of the feature, not a nicety: a listing that vanishes silently
    // looks like the site lost it, and the seller has no prompt to renew —
    // which is the one action that earns money here.
    const [email] = mailTo('prodavac@nekretnine.test')
    expect(email?.subject).toContain('Trosoban stan u centru Bugojna')
  })

  it('removes it from public browse but keeps it in the seller’s own list', async () => {
    const seller = await createSeller()
    await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: daysAgo(1),
    })

    await expireDueListings()

    expect((await api().get<Paginated<ListingSummary>>('/api/listings')).body.total).toBe(0)

    const mine = await seller.client.get<{ items: ListingSummary[] }>('/api/listings/mine')
    expect(mine.body.items).toHaveLength(1)
    expect(mine.body.items[0]?.status).toBe('EXPIRED')
  })

  it('leaves alone anything not yet due', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: daysFromNow(1),
    })

    expect(await expireDueListings()).toEqual({ expired: 0, notified: 0 })
    expect(await statusOf(listing.id)).toBe('PUBLISHED')
  })

  it('leaves a published listing with no expiry date live', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: null,
    })

    await expireDueListings()

    // Not a bug to guard against — it is what an admin publishing without a
    // date asked for.
    expect(await statusOf(listing.id)).toBe('PUBLISHED')
  })

  it('ignores listings that are not published, however old their date', async () => {
    const seller = await createSeller()
    const sold = await insertListing(seller.user.id, {
      status: 'SOLD',
      soldAt: daysAgo(2),
      expiresAt: daysAgo(1),
    })
    const pending = await insertListing(seller.user.id, {
      status: 'PENDING',
      expiresAt: daysAgo(1),
    })

    expect(await expireDueListings()).toEqual({ expired: 0, notified: 0 })
    expect(await statusOf(sold.id)).toBe('SOLD')
    expect(await statusOf(pending.id)).toBe('PENDING')
  })

  it('ignores a deleted listing', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: daysAgo(1),
      deletedAt: new Date(),
    })

    expect(await expireDueListings()).toEqual({ expired: 0, notified: 0 })
    expect(await statusOf(listing.id)).toBe('PUBLISHED')
  })

  it('does nothing on a second run, and sends no second email', async () => {
    const seller = await createSeller()
    await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: daysAgo(1),
      contactEmail: 'prodavac@nekretnine.test',
    })

    await expireDueListings()
    const second = await expireDueListings()

    /*
     * The job runs hourly and again shortly after every boot, so it re-runs
     * constantly. The single UPDATE ... WHERE status = 'PUBLISHED' is what
     * makes that safe: the second pass matches nothing, which is also why two
     * API instances running it at the same moment cannot both email the same
     * seller.
     */
    expect(second).toEqual({ expired: 0, notified: 0 })
    expect(mailTo('prodavac@nekretnine.test')).toHaveLength(1)
  })

  it('still expires a listing whose seller left no contact email', async () => {
    const seller = await createSeller()
    const listing = await insertListing(seller.user.id, {
      status: 'PUBLISHED',
      expiresAt: daysAgo(1),
      contactEmail: null,
    })

    expect(await expireDueListings()).toEqual({ expired: 1, notified: 0 })
    expect(await statusOf(listing.id)).toBe('EXPIRED')
    expect(outbox).toHaveLength(0)
  })

  it('expires everything that is due in one pass', async () => {
    const seller = await createSeller()
    for (let i = 0; i < 3; i += 1) {
      await insertListing(seller.user.id, { status: 'PUBLISHED', expiresAt: daysAgo(i + 1) })
    }

    expect((await expireDueListings()).expired).toBe(3)
  })
})

async function statusOf(id: string): Promise<string | undefined> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id))
  return row?.status
}
