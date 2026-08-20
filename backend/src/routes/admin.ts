import { Router } from 'express'
import { z } from 'zod'
import { LISTING_STATUSES } from 'shared'
import {
  adminListListings,
  adminListingDetail,
  adminListingInquiries,
  listingStatusCounts,
} from '../services/admin.js'
import { currentUser, requireAdmin, requireAuth } from '../middleware/auth.js'

/**
 * Every route here is behind `requireAuth` then `requireAdmin`, applied to the
 * whole router rather than repeated per route.
 *
 * That ordering is not cosmetic: `requireAdmin` would throw "not signed in"
 * for an anonymous caller anyway, but declaring both makes the requirement
 * readable, and applying them at the router means a route added later cannot
 * be left unguarded by forgetting to repeat them.
 */
export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

const queueSchema = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

/** GET /api/admin/listings?status=PENDING */
adminRouter.get('/listings', async (req, res) => {
  const { status, page } = queueSchema.parse(req.query)
  const [listings, counts] = await Promise.all([
    adminListListings(status, page),
    listingStatusCounts(),
  ])
  res.json({ ...listings, counts })
})

/** GET /api/admin/listings/:id */
adminRouter.get('/listings/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  res.json({ listing: await adminListingDetail(id, currentUser(req)) })
})

/** GET /api/admin/listings/:id/inquiries — for investigating abuse. */
adminRouter.get('/listings/:id/inquiries', async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  res.json({ items: await adminListingInquiries(id) })
})
