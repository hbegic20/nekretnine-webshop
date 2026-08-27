import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { inquiries, type Inquiry } from '../db/schema.js'
import { api, type ApiError } from '../test/api.js'
import { createAdmin, createSeller, insertListing, publishedListing } from '../test/factories.js'
import { breakMailer, mailTo, outbox } from '../test/mailbox.js'

const MESSAGE = {
  name: 'Selma Kupac',
  email: 'selma@primjer.test',
  phone: '062 333 444',
  message: 'Da li je stan još uvijek dostupan za obilazak ovaj vikend?',
}

describe('POST /api/listings/:id/inquiries', () => {
  it('stores the message and emails the seller, with reply-to set to the buyer', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id, {
      contactEmail: 'prodavac@nekretnine.test',
      title: 'Trosoban stan u centru Bugojna',
    })

    const response = await api().post(`/api/listings/${listing.id}/inquiries`, MESSAGE)

    expect(response.status).toBe(201)

    const stored = await inquiriesFor(listing.id)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.message).toBe(MESSAGE.message)
    // Whether the notification actually went out, recorded rather than assumed.
    expect(stored[0]?.emailSentAt).not.toBeNull()

    const [email] = mailTo('prodavac@nekretnine.test')
    expect(email?.subject).toContain('Trosoban stan u centru Bugojna')
    // The seller hits reply and reaches the buyer, not our noreply address.
    expect(email?.replyTo).toBe(MESSAGE.email)
    expect(email?.text).toContain(MESSAGE.message)
  })

  it('needs no account — a buyer should not have to sign up to ask a question', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    expect((await api().post(`/api/listings/${listing.id}/inquiries`, MESSAGE)).status).toBe(201)
  })

  it('keeps the message when the email fails to send', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)
    breakMailer()

    const response = await api().post(`/api/listings/${listing.id}/inquiries`, MESSAGE)

    /*
     * The whole design of services/inquiries.ts, in one test. Email delivery
     * fails quietly and often — bad SPF, a spam folder, a seller who typo'd
     * their address. If the only copy of a buyer's message is an email that
     * never arrived, a sale is lost and nobody ever finds out.
     */
    expect(response.status).toBe(201)

    const stored = await inquiriesFor(listing.id)
    expect(stored).toHaveLength(1)
    // Null is the honest answer: stored, not delivered.
    expect(stored[0]?.emailSentAt).toBeNull()
  })

  it('stores the message when the listing has no contact email at all', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id, { contactEmail: null })

    const response = await api().post(`/api/listings/${listing.id}/inquiries`, MESSAGE)

    expect(response.status).toBe(201)
    expect(await inquiriesFor(listing.id)).toHaveLength(1)
    expect(outbox).toHaveLength(0)
  })

  it('swallows a honeypot submission without telling the bot', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await api().post(`/api/listings/${listing.id}/inquiries`, {
      ...MESSAGE,
      website: 'https://spam.example',
    })

    // 201, not an error: telling a bot it was detected teaches whoever wrote
    // it to stop filling the field in. A real person never sees this branch,
    // because the field is hidden with CSS.
    expect(response.status).toBe(201)
    expect(await inquiriesFor(listing.id)).toHaveLength(0)
    expect(outbox).toHaveLength(0)
  })

  it.each([
    ['a message too short to be one', { message: 'zdravo' }],
    ['an invalid email address', { email: 'nije-email' }],
    ['a missing name', { name: '' }],
  ])('rejects %s', async (_label, override) => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    const response = await api().post<ApiError>(`/api/listings/${listing.id}/inquiries`, {
      ...MESSAGE,
      ...override,
    })

    expect(response.status).toBe(400)
    expect(await inquiriesFor(listing.id)).toHaveLength(0)
  })

  it('refuses an inquiry about a listing the public cannot see', async () => {
    const seller = await createSeller()
    const draft = await insertListing(seller.user.id, { status: 'DRAFT' })

    const response = await api().post(`/api/listings/${draft.id}/inquiries`, MESSAGE)

    expect(response.status).toBe(404)
  })

  it('allows one about a sold listing, which still has a page', async () => {
    const seller = await createSeller()
    const sold = await insertListing(seller.user.id, { status: 'SOLD', soldAt: new Date() })

    expect((await api().post(`/api/listings/${sold.id}/inquiries`, MESSAGE)).status).toBe(201)
  })
})

describe('GET /api/admin/listings/:id/inquiries', () => {
  it('shows an admin the messages, for abuse handling', async () => {
    const seller = await createSeller()
    const admin = await createAdmin()
    const listing = await publishedListing(seller.user.id)
    await api().post(`/api/listings/${listing.id}/inquiries`, MESSAGE)

    const response = await admin.client.get<{ items: Inquiry[] }>(
      `/api/admin/listings/${listing.id}/inquiries`,
    )

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
  })

  it('is closed to the seller and to anyone else', async () => {
    const seller = await createSeller()
    const listing = await publishedListing(seller.user.id)

    expect((await seller.client.get(`/api/admin/listings/${listing.id}/inquiries`)).status).toBe(403)
    expect((await api().get(`/api/admin/listings/${listing.id}/inquiries`)).status).toBe(401)
  })
})

function inquiriesFor(listingId: string): Promise<Inquiry[]> {
  return db.select().from(inquiries).where(eq(inquiries.listingId, listingId))
}
