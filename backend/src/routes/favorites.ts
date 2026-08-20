import { Router } from 'express'
import { z } from 'zod'
import { addFavorite, listFavorites, removeFavorite } from '../services/favorites.js'
import { currentUser, requireAuth } from '../middleware/auth.js'

/**
 * Favorites are the one feature that makes a buyer need an account at all
 * (SPEC.md §2), so every route here requires one.
 */
export const favoritesRouter = Router()

/** GET /api/favorites */
favoritesRouter.get('/', requireAuth, async (req, res) => {
  res.json({ items: await listFavorites(currentUser(req).id) })
})

/**
 * PUT, not POST.
 *
 * PUT means "make this resource exist", which is idempotent — sending it twice
 * leaves the same state as sending it once. That matches a save button
 * exactly: a double click, a retried request on a flaky phone connection, or a
 * duplicate from a bored user should all end with the listing saved and no
 * error. POST would imply creating a second favorite, which is meaningless
 * here and impossible in the schema.
 */
favoritesRouter.put('/:listingId', requireAuth, async (req, res) => {
  const listingId = z.uuid().parse(req.params.listingId)
  await addFavorite(currentUser(req).id, listingId)
  res.status(204).end()
})

/** DELETE /api/favorites/:listingId — also idempotent. */
favoritesRouter.delete('/:listingId', requireAuth, async (req, res) => {
  const listingId = z.uuid().parse(req.params.listingId)
  await removeFavorite(currentUser(req).id, listingId)
  res.status(204).end()
})
