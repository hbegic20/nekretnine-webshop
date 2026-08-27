import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  LISTING_STATUSES,
  type AdminListingDetail,
  type AdminListingSummary,
  type ListingOwner,
  type ListingStatus,
  type ListingStatusCounts,
  type Paginated,
  type PaymentRecord,
} from 'shared'
import { db } from '../db/index.js'
import { favorites, inquiries, listings, payments, users } from '../db/schema.js'
import { getListingDetail, summariesFor } from './listings.js'
import { notFound } from '../http/errors.js'
import type { User } from '../db/schema.js'

const ADMIN_PAGE_SIZE = 20

function toOwner(row: { id: string; name: string; email: string; phone: string | null }): ListingOwner {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone }
}

/**
 * Counts for every status in one query.
 *
 * `GROUP BY status` returns only statuses that currently have rows, so the
 * result is merged onto a zero-filled object. Without that, a tab whose count
 * happens to be zero would render "undefined" rather than "0" — a small thing
 * that makes a dashboard look broken.
 */
export async function listingStatusCounts(): Promise<ListingStatusCounts> {
  const rows = await db
    .select({ status: listings.status, count: sql<number>`count(*)::int` })
    .from(listings)
    .where(isNull(listings.deletedAt))
    .groupBy(listings.status)

  const counts = Object.fromEntries(LISTING_STATUSES.map((s) => [s, 0])) as ListingStatusCounts
  for (const row of rows) counts[row.status] = row.count
  return counts
}

/**
 * The moderation queue.
 *
 * Ordered oldest-first when showing PENDING, which is the opposite of every
 * other list in this app and deliberate: a queue is worked from the front.
 * Newest-first would leave the person who submitted three days ago waiting
 * behind everyone who submitted since.
 */
export async function adminListListings(
  status: ListingStatus | undefined,
  page: number,
): Promise<Paginated<AdminListingSummary>> {
  const perPage = ADMIN_PAGE_SIZE
  const where = status
    ? and(isNull(listings.deletedAt), eq(listings.status, status))
    : isNull(listings.deletedAt)

  const order = status === 'PENDING' ? asc(listings.updatedAt) : desc(listings.updatedAt)

  const [rows, counted] = await Promise.all([
    db
      .select({ listing: listings, owner: users })
      .from(listings)
      .innerJoin(users, eq(listings.ownerId, users.id))
      .where(where)
      .orderBy(order)
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(listings).where(where),
  ])

  const summaries = await summariesFor(rows.map((r) => r.listing))

  return {
    items: summaries.map((summary, index) => {
      const row = rows[index]!
      return {
        ...summary,
        owner: toOwner(row.owner),
        submittedAt: row.listing.updatedAt.toISOString(),
        expiresAt: row.listing.expiresAt?.toISOString() ?? null,
        featuredUntil: row.listing.featuredUntil?.toISOString() ?? null,
      }
    }),
    total: counted[0]?.count ?? 0,
    page,
    perPage,
  }
}

/**
 * Everything an admin needs to decide on one listing.
 *
 * The counts are here because they are the closest thing to evidence the queue
 * has: a listing with inquiries and saves is one real people are responding
 * to, which is worth knowing before taking it down.
 */
export async function adminListingDetail(id: string, admin: User): Promise<AdminListingDetail> {
  const rows = await db
    .select({ owner: users })
    .from(listings)
    .innerJoin(users, eq(listings.ownerId, users.id))
    .where(and(eq(listings.id, id), isNull(listings.deletedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) throw notFound('Oglas nije pronađen')

  const [listing, paymentRows, inquiryCount, favoriteCount] = await Promise.all([
    // Passing the admin is what unlocks the private fields — the street
    // address and any rejection reason. Same function the public page uses;
    // the difference is entirely in who is asking.
    getListingDetail(id, admin),
    db.select().from(payments).where(eq(payments.listingId, id)).orderBy(desc(payments.paidAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(inquiries).where(eq(inquiries.listingId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(favorites).where(eq(favorites.listingId, id)),
  ])

  return {
    ...listing,
    owner: toOwner(row.owner),
    payments: paymentRows.map(
      (payment): PaymentRecord => ({
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        note: payment.note,
        paidAt: payment.paidAt.toISOString(),
        recordedAt: payment.createdAt.toISOString(),
      }),
    ),
    inquiryCount: inquiryCount[0]?.count ?? 0,
    favoriteCount: favoriteCount[0]?.count ?? 0,
  }
}

/** Recent inquiries for a listing, so an admin can investigate abuse reports. */
export async function adminListingInquiries(listingId: string) {
  return db
    .select()
    .from(inquiries)
    .where(eq(inquiries.listingId, listingId))
    .orderBy(desc(inquiries.createdAt))
    .limit(50)
}
