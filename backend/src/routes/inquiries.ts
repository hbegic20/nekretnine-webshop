import { Router } from 'express'
import { z } from 'zod'
import { createInquiry } from '../services/inquiries.js'
import { inquiryLimiter } from '../http/rate-limit.js'
import { badRequest } from '../http/errors.js'

/** `mergeParams` is what makes `req.params.id` visible from the parent route. */
export const inquiriesRouter = Router({ mergeParams: true })

const inquirySchema = z.object({
  name: z.string().trim().min(2, 'Unesite ime').max(100),
  email: z.email('Unesite ispravnu email adresu').max(255),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(10, 'Poruka mora imati najmanje 10 znakova').max(2000),
  /**
   * Honeypot. A field named something a bot finds attractive, hidden from
   * people with CSS, and left empty by anyone real. Bots fill in every input
   * they find, so a non-empty value here is a very strong spam signal.
   *
   * It is not a CAPTCHA and will not stop a targeted attacker — but almost all
   * form spam is untargeted, and this costs nothing and asks nothing of the
   * person filling in the form. SPEC.md §4.7 requires "honeypot at minimum".
   */
  website: z.string().max(200).optional(),
})

/** POST /api/listings/:id/inquiries — open to anonymous visitors. */
inquiriesRouter.post('/', inquiryLimiter, async (req, res) => {
  const listingId = z.uuid().parse(req.params.id)
  const input = inquirySchema.parse(req.body)

  if (input.website && input.website.trim() !== '') {
    /*
     * Answer 201 rather than an error.
     *
     * Telling a bot it was detected teaches whoever wrote it to stop filling
     * the field. Silently accepting and discarding costs them a request and
     * tells them nothing. A real person can never see this branch, because a
     * real person never fills the field in.
     */
    res.status(201).json({ ok: true })
    return
  }

  if (!input.message) throw badRequest('Unesite poruku')

  await createInquiry({
    listingId,
    name: input.name,
    email: input.email,
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    message: input.message,
    ...(req.ip !== undefined ? { ip: req.ip } : {}),
  })

  // No echo of the stored row: the response goes to an anonymous caller, and
  // there is nothing here they need that they did not just type.
  res.status(201).json({ ok: true })
})
