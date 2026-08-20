import { randomUUID } from 'node:crypto'
import { and, asc, eq, max, sql } from 'drizzle-orm'
import sharp, { type Metadata, type Sharp } from 'sharp'
import type { ListingImage } from 'shared'
import { db } from '../db/index.js'
import { images, listings, type Image, type User } from '../db/schema.js'
import { storage } from '../storage/index.js'
import { badRequest, notFound } from '../http/errors.js'
import { log } from '../log.js'

/**
 * Limits, all deliberate.
 *
 * MAX_BYTES is checked before sharp touches the buffer. A "decompression bomb"
 * is a small file that expands into gigabytes of pixels when decoded, and the
 * cheapest defence is refusing to decode anything large in the first place.
 * sharp has its own pixel limit as a second line.
 */
const MAX_BYTES = 12 * 1024 * 1024
const MAX_IMAGES_PER_LISTING = 15
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Longest edge of the gallery image and of the card thumbnail. */
const LARGE_EDGE = 1600
const THUMB_EDGE = 480

export function isAcceptedType(contentType: string | undefined): boolean {
  return ACCEPTED.has((contentType ?? '').split(';')[0]!.trim().toLowerCase())
}

async function assertOwnsListing(listingId: string, user: User): Promise<void> {
  const rows = await db
    .select({ ownerId: listings.ownerId, status: listings.status })
    .from(listings)
    .where(and(eq(listings.id, listingId), sql`${listings.deletedAt} is null`))
    .limit(1)

  const listing = rows[0]
  if (!listing) throw notFound('Oglas nije pronađen')
  // Same 404-not-403 reasoning as everywhere else: do not confirm that a
  // listing you may not touch exists.
  if (!user.isAdmin && listing.ownerId !== user.id) throw notFound('Oglas nije pronađen')
}

/**
 * Adding or removing a photo pulls a live listing back into the review queue.
 *
 * The rule agreed in Phase 4.2 exempts only `price`, and a photo is content —
 * swapping the pictures on an approved listing is exactly the bait-and-switch
 * the rule exists to stop. Keeping images inside the same rule means there is
 * one policy rather than two that mostly agree.
 */
async function returnToReviewIfPublished(listingId: string, user: User): Promise<boolean> {
  if (user.isAdmin) return false

  const rows = await db
    .select({ status: listings.status })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)

  if (rows[0]?.status !== 'PUBLISHED') return false

  await db
    .update(listings)
    .set({ status: 'PENDING', updatedAt: new Date() })
    .where(eq(listings.id, listingId))

  log.info('listing returned to review after image change', { listingId })
  return true
}

export function toListingImage(row: Image): ListingImage {
  return {
    id: row.id,
    url: storage.urlFor(row.storageKey),
    thumbUrl: storage.urlFor(row.thumbKey),
    width: row.width,
    height: row.height,
    isCover: row.isCover,
  }
}

export interface UploadResult {
  image: ListingImage
  returnedToReview: boolean
}

export async function addImage(
  user: User,
  listingId: string,
  body: Buffer,
  contentType: string | undefined,
): Promise<UploadResult> {
  await assertOwnsListing(listingId, user)

  if (!isAcceptedType(contentType)) {
    throw badRequest('Podržani formati su JPEG, PNG i WebP', 'unsupported_type')
  }
  if (body.length === 0) throw badRequest('Datoteka je prazna')
  if (body.length > MAX_BYTES) {
    throw badRequest(`Slika je prevelika (najviše ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`)
  }

  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.listingId, listingId))
  if ((existing[0]?.count ?? 0) >= MAX_IMAGES_PER_LISTING) {
    throw badRequest(`Najviše ${MAX_IMAGES_PER_LISTING} slika po oglasu`)
  }

  /*
   * The Content-Type header is a claim, not a fact. Anyone can post a zip file
   * labelled image/jpeg. sharp decoding the bytes is what actually establishes
   * this is an image, so a failure here is a rejection rather than a 500.
   */
  let pipeline: Sharp
  let metadata: Metadata
  try {
    pipeline = sharp(body, { limitInputPixels: 50_000_000 })
    metadata = await pipeline.metadata()
  } catch {
    throw badRequest('Datoteka nije ispravna slika')
  }

  if (!metadata.width || !metadata.height) throw badRequest('Datoteka nije ispravna slika')

  /*
   * `.rotate()` with no argument applies the EXIF orientation flag.
   *
   * Phone cameras store the sensor image unrotated and record "this is
   * actually portrait" in EXIF. Skip this and every photo taken vertically
   * appears on its side — the single most common image bug in web apps.
   *
   * It also matters that sharp drops metadata by default on output: EXIF from
   * a phone routinely carries the GPS coordinates where the photo was taken.
   * Publishing those alongside a property listing would hand out the seller's
   * exact location, and often their home address, without anyone intending it.
   */
  const base = () => sharp(body, { limitInputPixels: 50_000_000 }).rotate()

  /*
   * `resolveWithObject` returns the encoded bytes *and* the final dimensions
   * in one pass, so the large image is resized once rather than twice.
   *
   * The dimensions have to come from the output, not from the input metadata:
   * `fit: 'inside'` preserves aspect ratio, so the result is rarely exactly
   * LARGE_EDGE, and `.rotate()` may have swapped width and height. Storing the
   * input's numbers would give the gallery a wrong aspect ratio and make the
   * page jump as images load.
   */
  const [large, thumbBuffer] = await Promise.all([
    base()
      .resize({ width: LARGE_EDGE, height: LARGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true }),
    base()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer(),
  ])

  const key = `listings/${listingId}/${randomUUID()}`
  const storageKey = `${key}.webp`
  const thumbKey = `${key}-thumb.webp`

  await Promise.all([
    storage.put(storageKey, large.data, 'image/webp'),
    storage.put(thumbKey, thumbBuffer, 'image/webp'),
  ])

  const nextPosition = await db
    .select({ value: max(images.position) })
    .from(images)
    .where(eq(images.listingId, listingId))

  const isFirst = (existing[0]?.count ?? 0) === 0

  const inserted = await db
    .insert(images)
    .values({
      listingId,
      storageKey,
      thumbKey,
      width: large.info.width,
      height: large.info.height,
      position: (nextPosition[0]?.value ?? -1) + 1,
      // The first photo becomes the cover automatically. A listing whose card
      // shows no picture looks broken, and asking someone to pick a cover
      // before they have uploaded a second photo is a pointless step.
      isCover: isFirst,
    })
    .returning()

  const row = inserted[0]
  if (!row) throw new Error('insert returned no row')

  const returnedToReview = await returnToReviewIfPublished(listingId, user)
  log.info('image added', { listingId, imageId: row.id })

  return { image: toListingImage(row), returnedToReview }
}

export async function listImages(listingId: string): Promise<Image[]> {
  return db.select().from(images).where(eq(images.listingId, listingId)).orderBy(asc(images.position))
}

export async function deleteImage(user: User, imageId: string): Promise<{ returnedToReview: boolean }> {
  const rows = await db.select().from(images).where(eq(images.id, imageId)).limit(1)
  const image = rows[0]
  if (!image) throw notFound('Slika nije pronađena')

  await assertOwnsListing(image.listingId, user)

  await db.delete(images).where(eq(images.id, imageId))

  /*
   * Files are removed after the row, and a failure here is logged rather than
   * thrown.
   *
   * If the delete succeeded in the database but the bytes linger, the result
   * is a few orphaned files nobody can reach — wasted storage. If we did it
   * the other way round and the database delete failed, the listing would show
   * an image whose file is gone: a broken picture on a live page. Given a
   * choice between wasted bytes and a visibly broken listing, waste the bytes.
   */
  await Promise.all([
    storage.delete(image.storageKey).catch((error: unknown) => {
      log.warn('orphaned image file', { key: image.storageKey, error: String(error) })
    }),
    storage.delete(image.thumbKey).catch((error: unknown) => {
      log.warn('orphaned thumb file', { key: image.thumbKey, error: String(error) })
    }),
  ])

  // If the cover was deleted, promote whatever is now first so the listing
  // never ends up with photos but no cover.
  if (image.isCover) {
    const remaining = await listImages(image.listingId)
    const next = remaining[0]
    if (next) await db.update(images).set({ isCover: true }).where(eq(images.id, next.id))
  }

  const returnedToReview = await returnToReviewIfPublished(image.listingId, user)
  log.info('image deleted', { imageId, listingId: image.listingId })
  return { returnedToReview }
}

export async function setCover(user: User, imageId: string): Promise<void> {
  const rows = await db.select().from(images).where(eq(images.id, imageId)).limit(1)
  const image = rows[0]
  if (!image) throw notFound('Slika nije pronađena')

  await assertOwnsListing(image.listingId, user)

  /*
   * Both statements in one transaction. Between clearing the old cover and
   * setting the new one there is a moment with no cover at all; a transaction
   * means no reader ever observes it, and a crash in between cannot leave the
   * listing coverless.
   */
  await db.transaction(async (tx) => {
    await tx.update(images).set({ isCover: false }).where(eq(images.listingId, image.listingId))
    await tx.update(images).set({ isCover: true }).where(eq(images.id, imageId))
  })
}
