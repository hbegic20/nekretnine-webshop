import { sql, relations } from 'drizzle-orm'
import {
  customType,
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import {
  LISTING_STATUSES,
  PROPERTY_TYPES,
  TRANSACTION_TYPES,
  TOWN_SLUGS,
} from 'shared'

/*
 * ---------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------------
 * These are defined once in /shared and reused here, so the list of valid
 * property types in the database is literally the same array the dropdown in
 * the UI is built from. They cannot drift apart.
 *
 * A Postgres enum (rather than a text column) means the database itself
 * rejects a bad value. Adding a value later is a migration — mild friction,
 * which is the point: it keeps typos and one-off variants out of the data.
 */
/**
 * Postgres has a `tsvector` type for full-text search; Drizzle does not ship a
 * helper for it, so we declare one. `customType` is the escape hatch for any
 * column type the ORM does not model — it tells Drizzle what to emit in DDL
 * and otherwise stays out of the way.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const listingStatusEnum = pgEnum('listing_status', LISTING_STATUSES)
export const propertyTypeEnum = pgEnum('property_type', PROPERTY_TYPES)
export const transactionTypeEnum = pgEnum('transaction_type', TRANSACTION_TYPES)
export const townEnum = pgEnum('town', TOWN_SLUGS)

/*
 * ---------------------------------------------------------------------------
 * users
 * ---------------------------------------------------------------------------
 * Roles are additive boolean flags on one row, not separate account types.
 * One person can list their flat and save three others (SPEC.md §2).
 *
 * `is_admin` is never settable through the API. It is granted by hand, in the
 * database. There is no public path to becoming an admin, by design.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    isSeller: boolean('is_seller').notNull().default(false),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness. Without lower(), "Haris@x.com" and
    // "haris@x.com" would be two accounts, and the second login attempt would
    // fail in a way nobody can debug.
    uniqueIndex('users_email_lower_unique').on(sql`lower(${t.email})`),
  ],
)

/*
 * ---------------------------------------------------------------------------
 * sessions
 * ---------------------------------------------------------------------------
 * Server-side sessions instead of JWTs (ARCHITECTURE.md §5.2). The id is an
 * opaque random token that also serves as the cookie value — it carries no
 * information, so nothing leaks if someone reads it.
 *
 * `onDelete: 'cascade'` means deleting a user logs them out everywhere,
 * automatically, without any application code.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    // Lets a periodic cleanup job delete expired rows without a full scan.
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
)

/*
 * ---------------------------------------------------------------------------
 * listings
 * ---------------------------------------------------------------------------
 * The centre of the app. Lifecycle: DRAFT → PENDING → PUBLISHED →
 * EXPIRED/SOLD, with REJECTED as a side branch (SPEC.md §3).
 *
 * On money: `price` is a plain integer number of KM. Not a float (cannot
 * represent money exactly), not numeric/decimal (comes back from the driver as
 * a string that must be parsed at every use). Property prices here are always
 * whole marks. See shared/src/money.ts.
 *
 * On location: two plain float columns, no PostGIS (ARCHITECTURE.md §4.1).
 * At a few hundred rows there is nothing an index could speed up.
 */
export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    status: listingStatusEnum('status').notNull().default('DRAFT'),

    title: text('title').notNull(),
    description: text('description').notNull().default(''),

    price: integer('price').notNull(),
    propertyType: propertyTypeEnum('property_type').notNull(),
    transactionType: transactionTypeEnum('transaction_type').notNull(),

    sizeM2: integer('size_m2'),
    rooms: integer('rooms'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    floor: integer('floor'),
    yearBuilt: integer('year_built'),

    town: townEnum('town').notNull(),
    neighbourhood: text('neighbourhood'),
    /** Never rendered in full publicly — see SPEC.md §4.2. */
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),

    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone').notNull(),
    contactEmail: text('contact_email'),

    /** Set when an admin approves. Null in every other state. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    soldAt: timestamp('sold_at', { withTimezone: true }),
    /** Shown to the seller so they know what to fix before resubmitting. */
    rejectionReason: text('rejection_reason'),

    /**
     * Paid placement, until this moment. Null means never featured.
     *
     * A date rather than a boolean so nothing has to switch it off — see the
     * note in migration 0004. It is set by an admin at approval, alongside the
     * payment that bought it.
     */
    featuredUntil: timestamp('featured_until', { withTimezone: true }),

    /**
     * The full-text search index, maintained by Postgres itself.
     *
     * A GENERATED column is recomputed on every insert and update, so it can
     * never fall out of sync with the text it summarises. The alternative —
     * updating it from application code — works right up until someone writes
     * a migration or a script that touches `title` directly.
     *
     * Two details that are easy to get wrong:
     *
     *  - the config is `'simple'`, not `'english'`. Postgres has no
     *    Bosnian/Croatian/Serbian dictionary, and English stemming on Bosnian
     *    text does more harm than nothing at all.
     *  - `f_unaccent` is our own IMMUTABLE wrapper around the `unaccent`
     *    extension. Postgres refuses to build a generated column or an index
     *    on `unaccent()` directly, because the extension's function is only
     *    STABLE — it depends on a dictionary that could in principle be
     *    changed. The wrapper promises it will not be. Without unaccent,
     *    searching "Gornji Vakuf" would not match "Gornji Vakuf" typed on an
     *    English keyboard, which is most phones here.
     *
     * Created in migration 0002, which had to be hand-edited — see the comment
     * at the top of that file.
     */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('simple', f_unaccent(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(neighbourhood, '')))`,
    ),

    /**
     * Soft delete. A listing a seller "deletes" keeps its row and disappears
     * from every view, because hard-deleting it would cascade away its
     * `payments` rows — the record that this person paid us — and its
     * inquiry history along with them. Losing financial records to a
     * misclick is not a trade worth making.
     *
     * The cost is that every query which returns listings must say
     * `isNull(listings.deletedAt)`. Forget it once and deleted listings
     * reappear on the site. That is why services/listings.ts funnels every
     * read through a single `visible()` helper instead of writing the
     * condition out by hand each time.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every public query filters on status, so it leads both indexes.
    // Column order in a composite index matters: Postgres can only use it
    // left-to-right, so (status, published_at) helps "published, newest first"
    // while (published_at, status) would not.
    // Partial: the public listing page only ever wants rows that are not
    // deleted, so the index does not carry the ones that are. It is smaller,
    // and it documents the intended query shape.
    index('listings_status_published_at_idx')
      .on(t.status, t.publishedAt.desc())
      .where(sql`deleted_at is null`),
    index('listings_status_town_price_idx').on(t.status, t.town, t.price),
    index('listings_owner_id_idx').on(t.ownerId),
    // Map viewport queries: WHERE lat BETWEEN … AND lng BETWEEN …
    index('listings_status_lat_lng_idx').on(t.status, t.lat, t.lng),
    // The scheduled expiry job scans for published listings past their date.
    index('listings_expires_at_idx').on(t.expiresAt),
    // Featured rows sort first on the public list. Partial: rows that were
    // never featured are the overwhelming majority and do not belong here.
    index('listings_featured_until_idx')
      .on(t.featuredUntil)
      .where(sql`featured_until is not null`),
    /*
     * GIN, not the default btree. A btree index answers "is this column equal
     * to X"; a tsvector holds many words per row and the question is "does it
     * contain X", which is what an inverted index is for. GIN is what makes
     * full-text search over the whole table fast.
     */
    index('listings_search_vector_idx').using('gin', t.searchVector),
  ],
)

/*
 * ---------------------------------------------------------------------------
 * images
 * ---------------------------------------------------------------------------
 * Only keys are stored, never bytes and never full URLs. The key is the path
 * inside whichever storage backend is active; the adapter turns it into a URL
 * at render time (ARCHITECTURE.md §6.1). Storing full URLs would bake
 * "localhost:4000" into rows that later have to be served from R2.
 */
export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    /**
     * A middle rendition, ~1000px. Nullable: rows created before migration
     * 0003 have none until `npm run images:backfill` generates them, and
     * toListingImage falls back to the large image meanwhile.
     */
    midKey: text('mid_key'),
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Display order within the gallery, ascending. */
    position: integer('position').notNull().default(0),
    isCover: boolean('is_cover').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('images_listing_id_position_idx').on(t.listingId, t.position)],
)

/*
 * ---------------------------------------------------------------------------
 * favorites
 * ---------------------------------------------------------------------------
 * A composite primary key on (user_id, listing_id) rather than a surrogate id.
 * The pair *is* the identity, and it makes "save this twice" impossible at the
 * database level instead of something the API has to remember to check.
 */
export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.listingId] }),
    index('favorites_listing_id_idx').on(t.listingId),
  ],
)

/*
 * ---------------------------------------------------------------------------
 * inquiries
 * ---------------------------------------------------------------------------
 * Stored as well as emailed, on purpose. Email delivery fails quietly and
 * often — bad SPF, spam folders, a seller who typo'd their address. If the
 * only copy of a buyer's message is an email that never arrived, a sale is
 * lost and nobody ever finds out (SPEC.md §4.7).
 *
 * There is no user_id: buyers do not need an account to enquire.
 */
export const inquiries = pgTable(
  'inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    message: text('message').notNull(),
    /** Kept for abuse handling and rate limiting. */
    ip: text('ip'),
    /** Whether the notification email actually went out. */
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inquiries_listing_id_created_at_idx').on(t.listingId, t.createdAt.desc())],
)

/*
 * ---------------------------------------------------------------------------
 * payments
 * ---------------------------------------------------------------------------
 * Money never moves through this app. The admin records a payment that already
 * happened offline, at the moment they approve a listing (SPEC.md §4.9).
 *
 * This is its own table rather than a few columns on `listings` because a
 * renewed listing is paid for a second time. One row per payment keeps that
 * history; columns on the listing would overwrite it.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    /** Which admin recorded it. Kept even if that admin is later deleted. */
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Whole KM, same convention as listings.price. */
    amount: integer('amount').notNull(),
    method: text('method').notNull(),
    note: text('note'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_listing_id_idx').on(t.listingId)],
)

/*
 * ---------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------------
 * These do not change the database at all — no SQL is generated from them.
 * They exist purely so Drizzle's query API can fetch related rows for us:
 *
 *   db.query.listings.findFirst({ with: { images: true, owner: true } })
 *
 * ...instead of writing the join by hand every time.
 */
export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  sessions: many(sessions),
  favorites: many(favorites),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const listingsRelations = relations(listings, ({ one, many }) => ({
  owner: one(users, { fields: [listings.ownerId], references: [users.id] }),
  images: many(images),
  favorites: many(favorites),
  inquiries: many(inquiries),
  payments: many(payments),
}))

export const imagesRelations = relations(images, ({ one }) => ({
  listing: one(listings, { fields: [images.listingId], references: [listings.id] }),
}))

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  listing: one(listings, { fields: [favorites.listingId], references: [listings.id] }),
}))

export const inquiriesRelations = relations(inquiries, ({ one }) => ({
  listing: one(listings, { fields: [inquiries.listingId], references: [listings.id] }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  listing: one(listings, { fields: [payments.listingId], references: [listings.id] }),
  recordedBy: one(users, { fields: [payments.recordedByUserId], references: [users.id] }),
}))

/*
 * Row types inferred from the schema. `User` is what a SELECT returns;
 * `NewUser` is what an INSERT needs (defaults and generated columns optional).
 */
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Listing = typeof listings.$inferSelect
export type NewListing = typeof listings.$inferInsert
export type Image = typeof images.$inferSelect
export type Favorite = typeof favorites.$inferSelect
export type Inquiry = typeof inquiries.$inferSelect
export type Payment = typeof payments.$inferSelect
