import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import {
  ALLOWED_TRANSITIONS,
  DEFAULT_EXPIRY_DAYS,
  LISTINGS_PER_PAGE,
  MAX_MAP_PINS,
  PUBLIC_STATUSES,
  type ListingFilters,
  type MapPin,
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

/**
 * What the public *browses* (SPEC.md §3).
 *
 * Sold listings are excluded from search results unless asked for, because
 * someone looking for a flat to buy does not want a page of ones they cannot
 * have. Opening one directly still works — that is a different question, and
 * it is answered by `assertCanView` on the single-listing path rather than by
 * a condition here.
 *
 * (There was briefly a matching `publiclyViewable` helper for that other
 * question. The linter found it had never been called: reads of one listing go
 * through `getListingRow` + `assertCanView`, which already covers it.)
 */
function publiclyListed(includeSold: boolean, ...conditions: (SQL | undefined)[]): SQL | undefined {
  const statuses = includeSold ? [...PUBLIC_STATUSES] : (['PUBLISHED'] as const)
  return visible(inArray(listings.status, [...statuses]), ...conditions)
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

/**
 * Paid placement, evaluated against the clock rather than stored as a flag.
 *
 * Comparing here and in SQL means two places can disagree by however long a
 * request takes — a listing whose placement expires mid-request could sort
 * first and render without the ribbon. At a few hundred milliseconds and a
 * date measured in days, that is a difference nobody can observe; the
 * alternative is a boolean column and a job to turn it off, which is a thing
 * that gets forgotten.
 */
function isFeatured(listing: Listing): boolean {
  return listing.featuredUntil !== null && listing.featuredUntil.getTime() > Date.now()
}

function toImage(row: Image): ListingImage {
  return {
    id: row.id,
    url: storage.urlFor(row.storageKey),
    // See the note in services/images.ts — null means "written before the mid
    // rendition existed", and the full image is the honest stand-in.
    midUrl: storage.urlFor(row.midKey ?? row.storageKey),
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
    isFeatured: isFeatured(listing),
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
    // Same rule: the public sees *that* a listing is featured, not until when.
    featuredUntil: canSeePrivate ? (listing.featuredUntil?.toISOString() ?? null) : null,
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

/**
 * Turns a keyword into a Postgres text-search query.
 *
 * `plainto_tsquery` is the forgiving one: it takes whatever a person typed,
 * discards punctuation and ANDs the words together. `to_tsquery` would demand
 * operator syntax and throw a syntax error on an apostrophe — a search box
 * must never 500 because someone typed `don't`.
 *
 * f_unaccent is applied to the search term as well as to the indexed text.
 * Stripping diacritics on only one side matches nothing.
 */
function keywordCondition(q: string): SQL {
  return sql`${listings.searchVector} @@ plainto_tsquery('simple', f_unaccent(${q}))`
}

/**
 * Every filter is an optional AND.
 *
 * Note what happens to rows with a NULL in a filtered column: `bedrooms >= 2`
 * is NULL for a listing that never recorded its bedroom count, and NULL is not
 * true, so it drops out. That is the right behaviour — someone who asked for
 * two bedrooms should not be shown a listing that might have none — but it is
 * worth knowing, because it means incomplete listings quietly become
 * invisible as soon as a buyer filters.
 */
function filterConditions(filters: ListingFilters): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = []

  if (filters.q) conditions.push(keywordCondition(filters.q))
  if (filters.town) conditions.push(eq(listings.town, filters.town))
  if (filters.propertyType) conditions.push(eq(listings.propertyType, filters.propertyType))
  if (filters.transactionType) conditions.push(eq(listings.transactionType, filters.transactionType))
  if (filters.priceMin !== undefined) conditions.push(gte(listings.price, filters.priceMin))
  if (filters.priceMax !== undefined) conditions.push(lte(listings.price, filters.priceMax))
  if (filters.bedsMin !== undefined) conditions.push(gte(listings.bedrooms, filters.bedsMin))
  if (filters.bathsMin !== undefined) conditions.push(gte(listings.bathrooms, filters.bathsMin))
  if (filters.sizeMin !== undefined) conditions.push(gte(listings.sizeM2, filters.sizeMin))
  if (filters.sizeMax !== undefined) conditions.push(lte(listings.sizeM2, filters.sizeMax))

  return conditions
}

/**
 * Sort order, always ending in a unique tiebreaker.
 *
 * Without `id` at the end, two listings at the same price have no defined
 * order between them, and Postgres is free to return them differently on each
 * query. Across an OFFSET-paginated result that shows up as a listing
 * appearing on both page 1 and page 2, or on neither — a genuinely confusing
 * bug that only appears once there are enough rows to paginate.
 */
function orderFor(filters: ListingFilters): SQL[] {
  const tiebreak = asc(listings.id)

  /*
   * When sold listings are included, they sort last whatever else is chosen.
   * `status = 'SOLD'` is false (sorting before true) for everything still
   * available, so ascending puts the available ones first — SPEC.md §3's
   * "sorted last", expressed as a boolean rather than a second query.
   */
  const soldLast = filters.includeSold
    ? [asc(sql`(${listings.status} = 'SOLD')`)]
    : []

  /*
   * Featured rows first — but strictly after `soldLast`, and that order is the
   * decision worth understanding.
   *
   * Sold-last wins, so a featured listing that has sold does not sit at the
   * top of the page advertising something nobody can buy. Someone paid for
   * that placement, and the honest reading of what they bought is prominence
   * among things a buyer can act on.
   *
   * `now()` is Postgres's clock, matching the expiry job, so placement runs
   * out on the database's time rather than on whichever server answered.
   *
   * Note there is no cap here. Featured placement only means anything while
   * most listings are not featured; the day half the first page is gold it has
   * stopped working. That is a selling decision rather than a query one at
   * this size, and it belongs with the admin who sets it — but if the queue
   * ever gets away from us, this is the place a limit would go.
   */
  const featuredFirst = [
    desc(sql`(${listings.featuredUntil} is not null and ${listings.featuredUntil} > now())`),
  ]

  switch (filters.sort) {
    case 'price_asc':
      return [...soldLast, ...featuredFirst, asc(listings.price), tiebreak]
    case 'price_desc':
      return [...soldLast, ...featuredFirst, desc(listings.price), tiebreak]
    case 'relevance':
      if (filters.q) {
        // ts_rank scores how well the row matches: more of the search terms,
        // occurring more often, scores higher.
        return [
          ...soldLast,
          ...featuredFirst,
          desc(sql`ts_rank(${listings.searchVector}, plainto_tsquery('simple', f_unaccent(${filters.q})))`),
          desc(listings.publishedAt),
          tiebreak,
        ]
      }
      return [...soldLast, ...featuredFirst, desc(listings.publishedAt), tiebreak]
    case 'newest':
    default:
      return [...soldLast, ...featuredFirst, desc(listings.publishedAt), tiebreak]
  }
}

/**
 * Rows → summaries, fetching their cover images in one query.
 *
 * Exported so favorites can reuse it. It deliberately does *not* know about
 * favorites itself: this module would then import that one, which imports this
 * one, and the cycle would work today and break the moment either grows a
 * top-level side effect. The flag is attached in the route layer instead.
 */
export async function summariesFor(rows: Listing[]): Promise<ListingSummary[]> {
  const covers = await coverImagesFor(rows.map((r) => r.id))
  return rows.map((row) => toSummary(row, covers.get(row.id) ?? null))
}

/** The public, filtered, sorted, paginated list. */
export async function listPublicListings(
  filters: ListingFilters,
): Promise<Paginated<ListingSummary>> {
  const page = Math.max(1, filters.page)
  const perPage = LISTINGS_PER_PAGE
  const where = publiclyListed(filters.includeSold ?? false, ...filterConditions(filters))

  /*
   * The count and the page of rows are two queries, run together.
   *
   * They have to be separate — a windowed `count(*) OVER ()` would work but
   * ties the total to the page, and Postgres plans the two shapes very
   * differently. Running them concurrently costs one round trip rather than
   * two, since neither depends on the other.
   */
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(where)
      .orderBy(...orderFor(filters))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(listings).where(where),
  ])

  return {
    items: await summariesFor(rows),
    total: counted[0]?.count ?? 0,
    page,
    perPage,
  }
}

/**
 * Markers for the map view.
 *
 * Not paginated, because a map that shows page 1 of the pins is worse than no
 * map — the spread of prices across the region *is* the information. Instead
 * it selects only the six columns a marker needs and caps the row count.
 *
 * Listings without coordinates are excluded rather than dropped at longitude
 * 0. There is no sensible marker for "somewhere in Bugojno, unspecified", and
 * inventing one puts a pin in the Gulf of Guinea.
 */
export async function listMapPins(filters: ListingFilters): Promise<MapPin[]> {
  const rows = await db
    .select({
      id: listings.id,
      lat: listings.lat,
      lng: listings.lng,
      price: listings.price,
      title: listings.title,
      transactionType: listings.transactionType,
      propertyType: listings.propertyType,
    })
    .from(listings)
    .where(
      publiclyListed(
        filters.includeSold ?? false,
        sql`${listings.lat} is not null`,
        sql`${listings.lng} is not null`,
        ...filterConditions(filters),
      ),
    )
    .orderBy(...orderFor(filters))
    .limit(MAX_MAP_PINS)

  // The nulls are excluded in SQL above; this narrows the type for TypeScript,
  // which cannot know that a WHERE clause constrains a column's nullability.
  return rows.flatMap((row) =>
    row.lat === null || row.lng === null ? [] : [{ ...row, lat: row.lat, lng: row.lng }],
  )
}

/** Everything belonging to one seller, in every status. */
export async function listOwnListings(userId: string): Promise<ListingSummary[]> {
  const rows = await db
    .select()
    .from(listings)
    .where(visible(eq(listings.ownerId, userId)))
    .orderBy(desc(listings.updatedAt))

  return summariesFor(rows)
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
 * Turn paid placement on or off for a listing that is already live.
 *
 * Selling it at approval covers the common case, but not the ones that
 * actually come up: a seller who decides to promote a listing that has been up
 * for a week, an admin correcting a mistake, or a refund. Without this the
 * only way to change placement was to take the listing down and publish it
 * again, which resets `published_at` and drops it to the bottom of "newest" —
 * a punishing way to fix a typo.
 *
 * `days: null` removes it. That clears the date rather than setting it to the
 * past, because "featured until yesterday" and "never featured" mean different
 * things and only one of them is true after a refund.
 */
export async function setFeatured(
  user: User,
  id: string,
  days: number | null,
): Promise<Listing> {
  if (!user.isAdmin) throw forbidden('Samo administrator može izdvojiti oglas')

  const current = await getListingRow(id)

  /*
   * Only a live listing. Placement on anything else is placement nobody can
   * see — and an admin who features a draft has almost certainly mistaken it
   * for the published one, which is a mistake worth refusing rather than
   * silently accepting money for.
   */
  if (current.status !== 'PUBLISHED') {
    throw badRequest('Samo objavljen oglas može biti izdvojen')
  }

  const featuredUntil =
    days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const rows = await db
    .update(listings)
    .set({ featuredUntil, updatedAt: new Date() })
    .where(eq(listings.id, id))
    .returning()

  const updated = rows[0]
  if (!updated) throw notFound('Oglas nije pronađen')

  log.info('listing featured', { listingId: id, byUserId: user.id, days })
  return updated
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
  options: { expiryDays?: number; rejectionReason?: string; featuredDays?: number } = {},
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

    /*
     * Paid placement, if the seller bought it. Left alone when they did not,
     * rather than cleared — a listing being re-published after an edit keeps
     * whatever placement it still has, because the seller paid for a period of
     * time and a round trip through the moderation queue should not consume
     * it.
     */
    if (options.featuredDays !== undefined) {
      patch.featuredUntil = new Date(now.getTime() + options.featuredDays * 24 * 60 * 60 * 1000)
    }
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
