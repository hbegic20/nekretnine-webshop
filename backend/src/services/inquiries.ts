import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { inquiries, listings, type Inquiry } from '../db/schema.js'
import { mailer } from '../mail/index.js'
import { notFound } from '../http/errors.js'
import { log } from '../log.js'

export interface InquiryInput {
  listingId: string
  name: string
  email: string
  phone?: string | undefined
  message: string
  ip?: string | undefined
}

/**
 * Store first, then email.
 *
 * The order is the whole design. Email delivery fails quietly and often — a
 * misconfigured SPF record, a spam folder, a seller who typo'd their address —
 * and if the only copy of a buyer's message is an email that never arrived,
 * a sale is lost and nobody ever finds out (SPEC.md §4.7).
 *
 * So the row is written and committed before we try to send, and a send
 * failure does not fail the request. From the buyer's side the message was
 * delivered to us, which is true. `email_sent_at` records whether it also
 * reached the seller, so a failure is visible rather than silent.
 */
export async function createInquiry(input: InquiryInput): Promise<Inquiry> {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      contactEmail: listings.contactEmail,
      contactName: listings.contactName,
      deletedAt: listings.deletedAt,
    })
    .from(listings)
    .where(eq(listings.id, input.listingId))
    .limit(1)

  const listing = rows[0]
  // Only a listing the public can see may be enquired about. Otherwise this
  // endpoint would confirm the existence of drafts and rejected listings.
  if (!listing || listing.deletedAt || !['PUBLISHED', 'SOLD'].includes(listing.status)) {
    throw notFound('Oglas nije pronađen')
  }

  const inserted = await db
    .insert(inquiries)
    .values({
      listingId: input.listingId,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      message: input.message.trim(),
      ip: input.ip ?? null,
    })
    .returning()

  const inquiry = inserted[0]
  if (!inquiry) throw new Error('insert returned no row')

  if (listing.contactEmail) {
    try {
      await mailer.send({
        to: listing.contactEmail,
        subject: `Novi upit za oglas: ${listing.title}`,
        // replyTo is what makes this useful: the seller hits reply and the
        // message goes to the buyer, not to our noreply address.
        replyTo: inquiry.email,
        text: [
          `Imate novi upit za oglas „${listing.title}".`,
          '',
          `Ime:     ${inquiry.name}`,
          `Email:   ${inquiry.email}`,
          inquiry.phone ? `Telefon: ${inquiry.phone}` : null,
          '',
          'Poruka:',
          inquiry.message,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      })

      await db.update(inquiries).set({ emailSentAt: new Date() }).where(eq(inquiries.id, inquiry.id))
    } catch (error) {
      // Logged, not thrown. The buyer's message is already safely stored.
      log.error('inquiry email failed to send', {
        inquiryId: inquiry.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    log.warn('listing has no contact email; inquiry stored only', { listingId: listing.id })
  }

  log.info('inquiry created', { inquiryId: inquiry.id, listingId: listing.id })
  return inquiry
}

export async function listInquiriesForListing(listingId: string): Promise<Inquiry[]> {
  return db.select().from(inquiries).where(eq(inquiries.listingId, listingId)).orderBy(desc(inquiries.createdAt))
}
