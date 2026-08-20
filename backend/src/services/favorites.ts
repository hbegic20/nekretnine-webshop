import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { PUBLIC_STATUSES, type FavoriteListing } from 'shared'
import { db } from '../db/index.js'
import { favorites, listings } from '../db/schema.js'
import { notFound } from '../http/errors.js'
import { log } from '../log.js'
import { summariesFor } from './listings.js'

/**
 * Save a listing.
 *
 * Only something the public can already see may be saved — otherwise this
 * endpoint would confirm which draft ids exist, by succeeding on real ones and
 * 404ing on the rest.
 */
export async function addFavorite(userId: string, listingId: string): Promise<void> {
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.id, listingId),
        isNull(listings.deletedAt),
        inArray(listings.status, [...PUBLIC_STATUSES]),
      ),
    )
    .limit(1)

  if (!rows[0]) throw notFound('Oglas nije pronađen')

  /*
   * `onConflictDoNothing` makes saving idempotent.
   *
   * The composite primary key already makes a duplicate impossible; without
   * this clause the second click would raise a unique violation and surface as
   * an error, even though the user's intent — "this should be saved" — is
   * satisfied. Double-clicking a heart is not a failure.
   */
  await db.insert(favorites).values({ userId, listingId }).onConflictDoNothing()
  log.info('favorite added', { userId, listingId })
}

/** Unsaving something that was not saved is a success, for the same reason. */
export async function removeFavorite(userId: string, listingId: string): Promise<void> {
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.listingId, listingId)))
}

/**
 * Everything this user has saved, newest save first.
 *
 * Note the statuses that are *not* filtered out. A listing that expired or
 * sold stays in the list and is marked unavailable, because quietly dropping
 * it would leave someone certain they had saved a flat that has vanished.
 * Soft-deleted listings are excluded — there is nothing to show and no page to
 * link to.
 */
export async function listFavorites(userId: string): Promise<FavoriteListing[]> {
  const rows = await db
    .select({ listing: listings })
    .from(favorites)
    .innerJoin(listings, eq(favorites.listingId, listings.id))
    .where(and(eq(favorites.userId, userId), isNull(listings.deletedAt)))
    .orderBy(desc(favorites.createdAt))

  const summaries = await summariesFor(rows.map((r) => r.listing))

  return summaries.map((summary) => ({
    ...summary,
    isFavorite: true,
    available: summary.status === 'PUBLISHED',
  }))
}

/**
 * Which of these listing ids the user has saved.
 *
 * One query for the whole page rather than one per card — the same N+1
 * avoidance as cover images. Returns a Set because the caller only ever asks
 * "is this id in there".
 */
export async function favoriteIdsFor(userId: string, listingIds: string[]): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set()

  const rows = await db
    .select({ listingId: favorites.listingId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), inArray(favorites.listingId, listingIds)))

  return new Set(rows.map((r) => r.listingId))
}

/** How many people have saved this listing — shown to its owner. */
export async function favoriteCount(listingId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(favorites)
    .where(eq(favorites.listingId, listingId))
  return rows[0]?.count ?? 0
}

/**
 * Attach `isFavorite` to a page of summaries.
 *
 * Called from the route layer rather than from inside the listings service, so
 * that listings never has to import favorites. One query for the page, not one
 * per card.
 */
export async function withFavoriteFlags<T extends { id: string }>(
  userId: string,
  items: T[],
): Promise<(T & { isFavorite: boolean })[]> {
  const saved = await favoriteIdsFor(userId, items.map((i) => i.id))
  return items.map((item) => ({ ...item, isFavorite: saved.has(item.id) }))
}
