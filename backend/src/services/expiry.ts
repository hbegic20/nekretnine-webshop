import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { listings } from '../db/schema.js'
import { mailer } from '../mail/index.js'
import { log } from '../log.js'

export interface ExpiryResult {
  expired: number
  notified: number
}

/**
 * Move published listings past their expiry date to EXPIRED.
 *
 * Until this existed, `expires_at` was decoration: an admin set it on
 * approval and nothing ever read it, so listings stayed live forever. The
 * whole paid-listing model depends on a listing actually coming down.
 *
 * The UPDATE is a single statement with the condition in the WHERE clause,
 * not a SELECT followed by an UPDATE. That matters for two reasons:
 *
 *   - It is atomic. Two API instances running this at the same moment cannot
 *     both expire the same row and send two emails; the second one's WHERE no
 *     longer matches, and RETURNING gives it an empty list.
 *   - `now()` is evaluated by Postgres, so the decision uses the database
 *     clock rather than whatever the application server's clock says. Those
 *     drift, and a listing expiring an hour early because a container's clock
 *     is off is a genuinely confusing bug.
 */
export async function expireDueListings(): Promise<ExpiryResult> {
  const expired = await db
    .update(listings)
    .set({ status: 'EXPIRED', updatedAt: new Date() })
    .where(
      and(
        eq(listings.status, 'PUBLISHED'),
        isNull(listings.deletedAt),
        // A published listing with no expiry never expires. That is not a bug
        // to guard against here — it is what an admin publishing without a
        // date asked for.
        sql`${listings.expiresAt} is not null`,
        lt(listings.expiresAt, sql`now()`),
      ),
    )
    .returning({
      id: listings.id,
      title: listings.title,
      contactEmail: listings.contactEmail,
      contactName: listings.contactName,
    })

  if (expired.length === 0) return { expired: 0, notified: 0 }

  log.info('listings expired', { count: expired.length, ids: expired.map((l) => l.id) })

  /*
   * Telling the seller is the point of the feature, not a nicety.
   *
   * A listing that silently disappears looks like the site lost it, and the
   * seller has no reason to come back and renew — which is the one action
   * that earns money here.
   *
   * Sending is best-effort, exactly as with inquiries: the status change is
   * already committed, and a mail failure must not undo it or crash the job.
   */
  let notified = 0
  for (const listing of expired) {
    if (!listing.contactEmail) continue

    try {
      await mailer.send({
        to: listing.contactEmail,
        subject: `Istekao je vaš oglas: ${listing.title}`,
        text: [
          `Poštovani ${listing.contactName},`,
          '',
          `Vremenski period objave za oglas „${listing.title}" je istekao i oglas`,
          'više nije vidljiv na stranici.',
          '',
          'Ako je nekretnina i dalje dostupna, oglas možete obnoviti u',
          'sekciji „Moji oglasi" — nakon toga ga administrator ponovo pregleda.',
        ].join('\n'),
      })
      notified += 1
    } catch (error) {
      log.warn('expiry email failed', {
        listingId: listing.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { expired: expired.length, notified }
}
