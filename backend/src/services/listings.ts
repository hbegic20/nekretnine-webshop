import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import {
  ALLOWED_TRANSITIONS,
  DEFAULT_EXPIRY_DAYS,
  LISTINGS_PER_PAGE,
  PUBLIC_STATUSES,
  type ListingDetail,
  type ListingImage,
  type ListingInput,
  type ListingStatus,
  type ListingSummary,
  type Paginated,
} from 'shared'
import { db } from '../db/index.js'
import { images, listings, users, type Image, type Listing, type User } from '../db/schema.js'
import { storage } from '../storage/index.js'
import { badRequest, forbidden, notFound } from '../http/errors.js'
import { log } from '../log.js'

/**
 * The one place the soft-delete rule is written.
 *
 * Every read goes through here. If this condition were spelled out at each
 * call site, the day someone adds a new query and forgets it is the day
 * deleted listings quietly come back — and nothing would fail loudly enough
 * to notice.
 */
function visible(...conditions: (SQL | undefined)[]): SQL | undefined {
  return and(isNull(listings.deletedAt), ...conditions)
}

/** What the public internet is allowed to see. */
function publiclyVisible(...conditions: (SQL | undefined)[]): SQL | undefined {
  return visible(inArray(listings.status, [...PUBLIC_STATUSES]), ...conditions)
}

/*
 * ---------------------------------------------------------------------------
 * Authorization
 * ---------------------------------------------------------------------------
 */

/**
 * May this person see this listing at all?
 *
 * Public statuses are visible to everyone. Anything else — a draft, something
 * waiting for review, something rejected — is visible only to its owner and to
 * admins.
 *
 * Returning 404 rather than 403 for a listing you may not see is deliberate:
 * a 403 would confirm that a listing with that id exists, which is more than a
 * stranger needs to know.
 */
function assertCanView(listing: Listing, user: User | undefined): void {
  const isPublic = (PUBLIC_STATUSES as readonly string[]).includes(listing.status)
  if (isPublic) return
  if (user && (user.id === listing.ownerId || user.isAdmin)) return
  throw notFound('Oglas nije pronađen')
}

function assertCanEdit(listing: Listing, user: User): void {
  if (user.isAdmin) return
  if (listing.ownerId !== user.id) {
    // Same reasoning as above — do not confirm the listing exists.
    throw notFound('Oglas nije pronađen')
  }
}

/*
 * ---------------------------------------------------------------------------
 * Mapping rows to API shapes
 * ---------------------------------------------------------------------------
 * Done explicitly rather than by spreading the row, so that adding a column to
 * the table never silently starts publishing it. `owner_id` and `deleted_at`
 * are examples of things that belong in the database and not in a response.
 */

function toImage(row: Image): ListingImage {
  return {
    id: row.id,
    url: storage.urlFor(row.storageKey),
    thumbUrl: storage.urlFor(row.thumbKey),
    width: row.width,
    height: row.height,
    isCover: row.isCover,
  }
}

function toSummary(listing: Listing, cover: Image | null): ListingSummary {
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    propertyType: listing.propertyType,
    transactionType: listing.transactionType,
    town: listing.town,
    neighbourhood: listing.neighbourhood,
    sizeM2: listing.sizeM2,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    status: listing.status,
    coverImage: cover ? toImage(cover) : null,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
  }
}

function toDetail(listing: Listing, imageRows: Image[], canSeePrivate: boolean): ListingDetail {
  const cover = imageRows.find((i) => i.isCover) ?? imageRows[0] ?? null

  return {
    ...toSummary(listing, cover),
    description: listing.description,
    rooms: listing.rooms,
    floor: listing.floor,
    yearBuilt: listing.yearBuilt,
    // The street address is never shown to the public — SPEC.md §4.2. The
    // town, neighbourhood and map pin are enough to find a property; the exact
    // address is for someone who has made contact.
    address: canSeePrivate ? listing.address : null,
    lat: listing.lat,
    lng: listing.lng,
    contactName: listing.contactName,
    contactPhone: listing.contactPhone,
    contactEmail: listing.contactEmail,
    images: imageRows.map(toImage),
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    soldAt: listing.soldAt?.toISOString() ?? null,
    // A rejection reason is a private note between admin and seller.
    rejectionReason: canSeePrivate ? listing.rejectionReason : null,
  }
}

/*
 * ---------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------------
 */

async function coverImagesFor(listingIds: string[]): Promise<Map<string, Image>> {
  if (listingIds.length === 0) return new Map()

  /*
   * One query for every cover image, not one query per listing.
   *
   * The N+1 problem: 24 cards, each fetching its own cover, is 25 round trips
   * to Postgres. Each is fast, but they are sequential and the latency adds
   * up. Fetching them all at once and matching them up in memory is one trip.
   */
  const rows = await db
    .select()
    .from(images)
    .where(inArray(images.listingId, listingIds))
    .orderBy(asc(images.position))

  const byListing = new Map<string, Image>()
  for (const row of rows) {
    const existing = byListing.get(row.listingId)
    // Prefer the flagged cover; otherwise the lowest position wins.
    if (!existing || (row.isCover && !existing.isCover)) byListing.set(row.listingId, row)
  }
  return byListing
}

export interface ListQuery {
  page?: number
  perPage?: number
}

/** The public list. Filters and sorting arrive in Phase 4.3. */
export async function listPublicListings(query: ListQuery): Promise<Paginated<ListingSummary>> {
  const page = Math.max(1, query.page ?? 1)
  const perPage = Math.min(60, Math.max(1, query.perPage ?? LISTINGS_PER_PAGE))
  const where = publiclyVisible()

  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(where)
      .orderBy(desc(listings.publishedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(listings).where(where),
  ])

  const covers = await coverImagesFor(rows.map((r) => r.id))

  return {
    items: rows.map((row) => toSummary(row, covers.get(row.id) ?? null)),
    total: counted[0]?.count ?? 0,
    page,
    perPage,
  }
}

/** Everything belonging to one seller, in every status. */
export async function listOwnListings(userId: string): Promise<ListingSummary[]> {
  const rows = await db
    .select()
    .from(listings)
    .where(visible(eq(listings.ownerId, userId)))
    .orderBy(desc(listings.updatedAt))

  const covers = await coverImagesFor(rows.map((r) => r.id))
  return rows.map((row) => toSummary(row, covers.get(row.id) ?? null))
}

export async function getListingRow(id: string): Promise<Listing> {
  const rows = await db.select().from(listings).where(visible(eq(listings.id, id))).limit(1)
  const row = rows[0]
  if (!row) throw notFound('Oglas nije pronađen')
  return row
}

export async function getListingDetail(id: string, user: User | undefined): Promise<ListingDetail> {
  const listing = await getListingRow(id)
  assertCanView(listing, user)

  const canSeePrivate = Boolean(user && (user.id === listing.ownerId || user.isAdmin))
  const imageRows = await db
    .select()
    .from(images)
    .where(eq(images.listingId, id))
    .orderBy(asc(images.position))

  return toDetail(listing, imageRows, canSeePrivate)
}

/*
 * ---------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------------
 */

export async function createListing(user: User, input: ListingInput): Promise<Listing> {
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(listings)
      .values({
        ...insertValues(input),
        ownerId: user.id,
        // Always DRAFT. Nothing reaches the public without passing through the
        // admin queue, and the client does not get to choose its own status.
        status: 'DRAFT',
      })
      .returning()

    /*
     * Becoming a seller is a consequence of listing something, not a question
     * asked at signup (ARCHITECTURE.md §5.4). Doing it in the same transaction
     * as the insert means the two facts can never disagree — there is no
     * moment where a listing exists whose owner is not marked a seller.
     */
    if (!user.isSeller) {
      await tx.update(users).set({ isSeller: true }).where(eq(users.id, user.id))
    }

    return rows[0]
  })

  if (!inserted) throw new Error('insert returned no row')
  log.info('listing created', { listingId: inserted.id, ownerId: user.id })
  return inserted
}

/**
 * Which fields actually changed, ignoring keys the caller did not send.
 *
 * Comparing values rather than counting keys matters: a form that posts every
 * field on every save would otherwise look like it changed everything, and
 * send a listing back for re-moderation because someone re-saved it untouched.
 */
function changedFields(current: Listing, patch: Partial<ListingInput>): string[] {
  const changed: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const before = (current as unknown as Record<string, unknown>)[key]
    const after = value === '' ? null : value
    if ((before ?? null) !== (after ?? null)) changed.push(key)
  }
  return changed
}

export interface UpdateResult {
  listing: Listing
  /** True when the edit sent a live listing back to the moderation queue. */
  returnedToReview: boolean
}

export async function updateListing(
  user: User,
  id: string,
  patch: Partial<ListingInput>,
): Promise<UpdateResult> {
  const current = await getListingRow(id)
  assertCanEdit(current, user)

  if (current.status === 'SOLD') {
    throw badRequest('Prodani oglas se ne može mijenjati')
  }

  const changed = changedFields(current, patch)
  const nextStatus = statusAfterEdit(current.status, changed, user)
  const returnedToReview = current.status === 'PUBLISHED' && nextStatus === 'PENDING'

  const rows = await db
    .update(listings)
    .set({
      ...updateValues(patch),
      status: nextStatus,
      // A fresh review starts without the previous rejection note attached.
      ...(nextStatus === 'DRAFT' ? { rejectionReason: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(listings.id, id))
    .returning()

  const updated = rows[0]
  if (!updated) throw notFound('Oglas nije pronađen')

  if (returnedToReview) {
    log.info('published listing returned to review', { listingId: id, changed })
  }

  return { listing: updated, returnedToReview }
}

/**
 * The moderation rule, in one function (SPEC.md §3, decided 2026-08-20).
 *
 *   PUBLISHED + price only        → stays live. Price cuts are the most common
 *                                   edit and should not wait for approval.
 *   PUBLISHED + anything else     → back to PENDING. Otherwise a seller could
 *                                   get a clean listing approved and then
 *                                   rewrite it into something else — the
 *                                   bait-and-switch this rule exists to stop.
 *   REJECTED + any edit           → DRAFT, so the seller resubmits deliberately
 *                                   rather than by accident.
 *   anything else                 → unchanged.
 *
 * Admins are exempt: an admin editing a live listing is moderation, not an
 * end-run around it.
 */
function statusAfterEdit(current: ListingStatus, changed: string[], user: User): ListingStatus {
  if (user.isAdmin) return current

  if (current === 'PUBLISHED') {
    const needsReview = changed.some((field) => field !== 'price')
    return needsReview ? 'PENDING' : 'PUBLISHED'
  }

  if (current === 'REJECTED' && changed.length > 0) return 'DRAFT'

  return current
}

/**
 * Soft delete. The row survives so its payment and inquiry history survives
 * with it (see the comment on `listings.deletedAt`).
 */
export async function deleteListing(user: User, id: string): Promise<void> {
  const current = await getListingRow(id)
  assertCanEdit(current, user)

  await db.update(listings).set({ deletedAt: new Date() }).where(eq(listings.id, id))
  log.info('listing soft-deleted', { listingId: id, byUserId: user.id })
}

/**
 * Move a listing through the lifecycle.
 *
 * Every transition is checked against ALLOWED_TRANSITIONS in /shared rather
 * than against a pile of if-statements here, so the state machine has exactly
 * one definition and the UI can read the same table to decide which buttons
 * to show.
 */
export async function transitionListing(
  user: User,
  id: string,
  to: ListingStatus,
  options: { expiryDays?: number; rejectionReason?: string } = {},
): Promise<Listing> {
  const current = await getListingRow(id)

  // Only admins may publish or reject; sellers may submit and mark sold.
  const adminOnly: ListingStatus[] = ['PUBLISHED', 'REJECTED']
  if (adminOnly.includes(to)) {
    if (!user.isAdmin) throw forbidden('Samo administrator može objaviti ili odbiti oglas')
  } else {
    assertCanEdit(current, user)
  }

  if (!ALLOWED_TRANSITIONS[current.status].includes(to)) {
    throw badRequest(`Oglas ne može preći iz ${current.status} u ${to}`)
  }

  const now = new Date()
  const patch: Partial<Listing> = { status: to, updatedAt: now }

  if (to === 'PUBLISHED') {
    patch.publishedAt = now
    patch.expiresAt = new Date(
      now.getTime() + (options.expiryDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    )
    patch.rejectionReason = null
  }
  if (to === 'REJECTED') patch.rejectionReason = options.rejectionReason ?? null
  if (to === 'SOLD') patch.soldAt = now

  const rows = await db.update(listings).set(patch).where(eq(listings.id, id)).returning()
  const updated = rows[0]
  if (!updated) throw notFound('Oglas nije pronađen')

  log.info('listing transitioned', { listingId: id, from: current.status, to })
  return updated
}

/**
 * Turning validated input into column values, explicitly.
 *
 * The first version of this was a loop that spread `Record<string, unknown>`
 * into the insert, and TypeScript rejected it — correctly. A loosely typed
 * bag erases exactly the check that catches a missing NOT NULL column or a
 * typo'd field name, which is the check worth having on a write path.
 *
 * Verbose, and worth it: adding a column to the table now produces a compile
 * error here until it is handled deliberately.
 */
function trimOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

type ListingColumns = typeof listings.$inferInsert

function insertValues(input: ListingInput): Omit<ListingColumns, 'ownerId'> {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    price: input.price,
    propertyType: input.propertyType,
    transactionType: input.transactionType,
    town: input.town,
    neighbourhood: trimOrNull(input.neighbourhood),
    address: trimOrNull(input.address),
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    sizeM2: input.sizeM2 ?? null,
    rooms: input.rooms ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    floor: input.floor ?? null,
    yearBuilt: input.yearBuilt ?? null,
    contactName: input.contactName.trim(),
    contactPhone: input.contactPhone.trim(),
    contactEmail: trimOrNull(input.contactEmail),
  }
}

/**
 * Only the keys the caller actually sent. A field left out of a PATCH means
 * "leave this alone", which is different from sending null to clear it — and
 * conflating the two is how an edit form that renders one section silently
 * wipes the fields in another.
 */
function updateValues(patch: Partial<ListingInput>): Partial<ListingColumns> {
  const out: Partial<ListingColumns> = {}

  if (patch.title !== undefined) out.title = patch.title.trim()
  if (patch.description !== undefined) out.description = patch.description.trim()
  if (patch.price !== undefined) out.price = patch.price
  if (patch.propertyType !== undefined) out.propertyType = patch.propertyType
  if (patch.transactionType !== undefined) out.transactionType = patch.transactionType
  if (patch.town !== undefined) out.town = patch.town
  if (patch.neighbourhood !== undefined) out.neighbourhood = trimOrNull(patch.neighbourhood)
  if (patch.address !== undefined) out.address = trimOrNull(patch.address)
  if (patch.lat !== undefined) out.lat = patch.lat
  if (patch.lng !== undefined) out.lng = patch.lng
  if (patch.sizeM2 !== undefined) out.sizeM2 = patch.sizeM2
  if (patch.rooms !== undefined) out.rooms = patch.rooms
  if (patch.bedrooms !== undefined) out.bedrooms = patch.bedrooms
  if (patch.bathrooms !== undefined) out.bathrooms = patch.bathrooms
  if (patch.floor !== undefined) out.floor = patch.floor
  if (patch.yearBuilt !== undefined) out.yearBuilt = patch.yearBuilt
  if (patch.contactName !== undefined) out.contactName = patch.contactName.trim()
  if (patch.contactPhone !== undefined) out.contactPhone = patch.contactPhone.trim()
  if (patch.contactEmail !== undefined) out.contactEmail = trimOrNull(patch.contactEmail)

  return out
}
