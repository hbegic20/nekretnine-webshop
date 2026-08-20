import express, { Router } from 'express'
import { z } from 'zod'
import { addImage, deleteImage, setCover } from '../services/images.js'
import { currentUser, requireAuth } from '../middleware/auth.js'
import { badRequest } from '../http/errors.js'
import { uploadLimiter } from '../http/rate-limit.js'

/**
 * Uploads take the raw image as the request body — no multipart.
 *
 * Express does not parse `multipart/form-data`, and the usual answer is
 * `multer`. That is not on the approved dependency list, and before adding it
 * the question is what multipart actually buys us: the ability to send several
 * files and some text fields in one request.
 *
 * We need neither. There are no text fields, and uploading one file per request
 * is better here anyway — each photo gets its own progress, its own error, and
 * a failure on the fourth image does not discard the first three. The browser
 * can post a File object directly as a fetch body, so the whole thing is
 * `express.raw` and a Content-Type check.
 *
 * If batching several files into one request ever becomes worth it, multer is
 * the right tool and this is the moment to ask for it.
 */
export const imagesRouter = Router({ mergeParams: true })

const rawImage = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '12mb',
})

/** POST /api/listings/:id/images */
imagesRouter.post('/', requireAuth, uploadLimiter, rawImage, async (req, res) => {
  const listingId = z.uuid().parse(req.params.id)

  /*
   * When the Content-Type does not match the list above, express.raw leaves
   * req.body as an empty object rather than a Buffer. Checking for that is
   * what turns "someone posted a PDF" into a clear 415 instead of a confusing
   * crash inside sharp.
   */
  if (!Buffer.isBuffer(req.body)) {
    throw badRequest('Pošaljite sliku kao tijelo zahtjeva (JPEG, PNG ili WebP)', 'unsupported_type')
  }

  const result = await addImage(currentUser(req), listingId, req.body, req.headers['content-type'])
  res.status(201).json(result)
})

export const imageItemRouter = Router()

/** DELETE /api/images/:imageId */
imageItemRouter.delete('/:imageId', requireAuth, async (req, res) => {
  const imageId = z.uuid().parse(req.params.imageId)
  res.json(await deleteImage(currentUser(req), imageId))
})

/** POST /api/images/:imageId/cover */
imageItemRouter.post('/:imageId/cover', requireAuth, async (req, res) => {
  const imageId = z.uuid().parse(req.params.imageId)
  await setCover(currentUser(req), imageId)
  res.status(204).end()
})
