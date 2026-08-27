import { Router } from 'express'
import { z } from 'zod'
import {
  PROPERTY_TYPES,
  TOWN_SLUGS,
  TRANSACTION_TYPES,
  isWithinRegion,
  parseListingFilters,
} from 'shared'
import { currentUser, requireAdmin, requireAuth } from '../middleware/auth.js'
import {
  createListing,
  deleteListing,
  getListingDetail,
  listMapPins,
  listOwnListings,
  listPublicListings,
  transitionListing,
  updateListing,
} from '../services/listings.js'
import { recordPayment } from '../services/payments.js'
import { withFavoriteFlags } from '../services/favorites.js'
import { imagesRouter } from './images.js'
import { inquiriesRouter } from './inquiries.js'
import { badRequest } from '../http/errors.js'

export const listingsRouter = Router()

/*
 * Sub-resources of a listing, mounted here so their URLs read the way the
 * data nests: /api/listings/:id/images, /api/listings/:id/inquiries.
 * Each still lives in its own file, as CLAUDE.md requires.
 */
listingsRouter.use('/:id/images', imagesRouter)
listingsRouter.use('/:id/inquiries', inquiriesRouter)

const currentYear = new Date().getFullYear()

/**
 * One schema, used two ways.
 *
 * `.partial()` on the base object gives the PATCH schema for free, so the
 * rules for a field are written once and cannot drift between create and edit.
 * That matters more than it sounds: a max length enforced on create but not on
 * edit is a validation hole that looks like it is covered.
 */
const listingFields = z.object({
  title: z.string().trim().min(10, 'Naslov mora imati najmanje 10 znakova').max(120),
  description: z.string().trim().max(5000),
  // Whole KM. The client sends a number; anything fractional is a bug.
  price: z.number().int('Cijena mora biti cijeli broj').positive().max(100_000_000),
  propertyType: z.enum(PROPERTY_TYPES),
  transactionType: z.enum(TRANSACTION_TYPES),
  town: z.enum(TOWN_SLUGS),
  neighbourhood: z.string().trim().max(100).nullish(),
  address: z.string().trim().max(200).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  sizeM2: z.number().int().positive().max(100_000).nullish(),
  rooms: z.number().int().min(0).max(50).nullish(),
  bedrooms: z.number().int().min(0).max(50).nullish(),
  bathrooms: z.number().int().min(0).max(50).nullish(),
  floor: z.number().int().min(-5).max(200).nullish(),
  // Allowing a few years ahead covers property still being built.
  yearBuilt: z.number().int().min(1800).max(currentYear + 3).nullish(),
  contactName: z.string().trim().min(2).max(100),
  contactPhone: z.string().trim().min(6, 'Unesite ispravan broj telefona').max(30),
  contactEmail: z.email().nullish(),
})

/**
 * Coordinates are checked as a pair, which a per-field rule cannot express.
 *
 * A listing with a latitude and no longitude is not half-placed, it is
 * unplaceable — and it would render as a marker at longitude 0, in the Gulf of
 * Guinea. Better to refuse it.
 */
function checkCoordinates(
  value: { lat?: number | null | undefined; lng?: number | null | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasLat = value.lat !== undefined && value.lat !== null
  const hasLng = value.lng !== undefined && value.lng !== null

  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: 'custom',
      path: [hasLat ? 'lng' : 'lat'],
      message: 'Potrebne su obje koordinate',
    })
    return
  }

  if (hasLat && hasLng && !isWithinRegion(value.lat!, value.lng!)) {
    ctx.addIssue({
      code: 'custom',
      path: ['lat'],
      message: 'Lokacija je izvan područja koje pokrivamo',
    })
  }
}

/**
 * `description` gets its default on create only, and that placement is load
 * bearing.
 *
 * It was originally `.default('')` on the base object, which looked harmless.
 * But `.partial()` makes a field optional without removing its default, so
 * every PATCH — including one that sent nothing but a new price — came out of
 * validation carrying `description: ''`. The service compared that against the
 * stored description, saw a change, and sent the listing back for
 * re-moderation. A seller cutting their price by 1000 KM would have watched
 * their listing vanish from the site.
 *
 * The general shape of the bug: a default is a value, and on a PATCH endpoint
 * "the caller did not send this" and "the caller sent the default" must stay
 * distinguishable.
 */
const createSchema = listingFields
  .extend({ description: z.string().trim().max(5000).default('') })
  .superRefine(checkCoordinates)

const updateSchema = listingFields.partial().superRefine(checkCoordinates)

/*
 * ---------------------------------------------------------------------------
 * Public reads
 * ---------------------------------------------------------------------------
 */

/**
 * GET /api/listings — published listings, filtered and sorted.
 *
 * Parsed by `parseListingFilters` from /shared, the same function the search
 * page uses to read the URL. There is deliberately no zod schema here: this
 * endpoint must never reject a request. A search URL gets hand-edited, shared
 * in chat apps and mangled by link previewers, so `?town=atlantis` should
 * quietly return unfiltered results rather than a validation error. The parser
 * drops anything it does not recognise, so nothing unvalidated reaches SQL.
 */
listingsRouter.get('/', async (req, res) => {
  const page = await listPublicListings(parseListingFilters(req.query))

  // `loadUser` has already run, so a signed-in visitor gets their saved state
  // in the same response — no second round trip per card. Anonymous visitors
  // get no flag at all, which is what tells the UI to hide the save button.
  if (!req.user) {
    res.json(page)
    return
  }

  res.json({ ...page, items: await withFavoriteFlags(req.user.id, page.items) })
})

/**
 * GET /api/listings/map — coordinates for every match, unpaginated.
 *
 * Before '/:id' for the same reason as '/mine': Express matches in order and
 * would otherwise read "map" as an id.
 */
listingsRouter.get('/map', async (req, res) => {
  res.json({ pins: await listMapPins(parseListingFilters(req.query)) })
})

/**
 * GET /api/listings/mine — the signed-in seller's own listings, every status.
 *
 * Registered before '/:id', because Express matches routes in order and
 * '/:id' would happily treat "mine" as an id.
 */
listingsRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ items: await listOwnListings(currentUser(req).id) })
})

/** GET /api/listings/:id — public when published, owner/admin otherwise. */
listingsRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  const listing = await getListingDetail(id, req.user)

  if (!req.user) {
    res.json({ listing })
    return
  }

  const [withFlag] = await withFavoriteFlags(req.user.id, [listing])
  res.json({ listing: withFlag })
})

/*
 * ---------------------------------------------------------------------------
 * Seller writes
 * ---------------------------------------------------------------------------
 */

/** POST /api/listings — always creates a DRAFT. */
listingsRouter.post('/', requireAuth, async (req, res) => {
  const input = createSchema.parse(req.body)
  const listing = await createListing(currentUser(req), input)
  res.status(201).json({ listing: await getListingDetail(listing.id, req.user) })
})

/**
 * PATCH /api/listings/:id
 *
 * The response says whether the edit pushed a live listing back into the
 * review queue, so the UI can explain what just happened rather than leaving
 * the seller to notice their listing vanished from the site.
 */
listingsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  const patch = updateSchema.parse(req.body)

  const { returnedToReview } = await updateListing(currentUser(req), id, patch)

  res.json({
    listing: await getListingDetail(id, req.user),
    returnedToReview,
  })
})

/** DELETE /api/listings/:id — soft delete; the row and its history survive. */
listingsRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  await deleteListing(currentUser(req), id)
  res.status(204).end()
})

/** POST /api/listings/:id/submit — DRAFT, REJECTED or EXPIRED → PENDING. */
listingsRouter.post('/:id/submit', requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  res.json({ listing: await transitionListing(currentUser(req), id, 'PENDING') })
})

/** POST /api/listings/:id/sold — PUBLISHED → SOLD. */
listingsRouter.post('/:id/sold', requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  res.json({ listing: await transitionListing(currentUser(req), id, 'SOLD') })
})

/*
 * ---------------------------------------------------------------------------
 * Admin moderation
 * ---------------------------------------------------------------------------
 * The API half of SPEC.md §4.9. The admin *interface* is still owed — the
 * phase list jumps from listings to search — but without these two endpoints
 * nothing can ever reach the public, so the lifecycle would be untestable and
 * every later phase would have an empty site to work with.
 */

const publishSchema = z.object({
  expiryDays: z.number().int().min(1).max(365).optional(),
  /**
   * The offline payment, recorded at the moment of approval (SPEC.md §4.9).
   * Optional so a listing can be published without one — a free renewal, a
   * favour — but the normal path records it.
   */
  payment: z
    .object({
      /*
       * At least 1 KM, not 0.
       *
       * A payment row is the record that this person paid us. Writing one for
       * zero says they paid nothing, which is a different fact from "we did
       * not charge them" — and only the second is true of a free renewal or a
       * favour. The way to record that is to omit `payment` entirely, which
       * this schema allows and the admin form already does (its "Zabilježi
       * uplatu" checkbox decides whether the object is sent at all).
       *
       * SPEC.md §4.9 states the rule; until now only the UI honoured it, so an
       * amount of 0 sent by hand or by a cleared input field wrote a zero row
       * into the ledger.
       */
      amount: z.number().int().min(1, 'Iznos uplate mora biti veći od nule').max(100_000),
      method: z.string().trim().min(2).max(40),
      paidAt: z.coerce.date(),
      note: z.string().trim().max(500).optional(),
    })
    .optional(),
})

/** POST /api/listings/:id/publish — PENDING → PUBLISHED. Admins only. */
listingsRouter.post('/:id/publish', requireAuth, requireAdmin, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  const body = publishSchema.parse(req.body ?? {})
  const admin = currentUser(req)

  const listing = await transitionListing(admin, id, 'PUBLISHED', {
    ...(body.expiryDays !== undefined ? { expiryDays: body.expiryDays } : {}),
  })

  if (body.payment) {
    await recordPayment({ listingId: id, recordedByUserId: admin.id, ...body.payment })
  }

  res.json({ listing })
})

const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'Navedite razlog odbijanja').max(500),
})

/** POST /api/listings/:id/reject — PENDING → REJECTED, with a reason. */
listingsRouter.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  const { reason } = rejectSchema.parse(req.body)

  // A rejection with no explanation gives the seller nothing to act on, so
  // the reason is required rather than optional.
  if (!reason) throw badRequest('Navedite razlog odbijanja')

  res.json({
    listing: await transitionListing(currentUser(req), id, 'REJECTED', { rejectionReason: reason }),
  })
})
