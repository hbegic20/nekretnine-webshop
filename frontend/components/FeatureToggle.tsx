'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from 'shared'
import { readApiError } from '@/lib/api-client'

/** Two weeks, which is what a fortnight of placement is usually sold as. */
const DEFAULT_FEATURE_DAYS = 14

/**
 * Start or stop paid placement on a listing that is already live.
 *
 * Deliberately usable straight from the admin queue rather than only from the
 * review page. Choosing what leads the grid is a judgement about the page as a
 * whole — which three of these deserve the top — and that is a decision made
 * while looking at the list, not while looking at one listing.
 *
 * Only rendered for PUBLISHED listings, because the API refuses anything else:
 * placement on a draft is placement nobody can see.
 */
export function FeatureToggle({
  listingId,
  isFeatured,
  featuredUntil,
  days = DEFAULT_FEATURE_DAYS,
}: {
  listingId: string
  isFeatured: boolean
  /** ISO date, shown so an admin can see what they are about to cut short. */
  featuredUntil?: string | null
  days?: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setError(null)
    setPending(true)

    try {
      const response = await fetch(`/api/listings/${listingId}/feature`, {
        method: isFeatured ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // DELETE carries no body; the endpoint takes the id from the path.
        ...(isFeatured ? {} : { body: JSON.stringify({ days }) }),
      })

      if (!response.ok) {
        setError((await readApiError(response)).message)
        return
      }
      // Re-render the server component so the row, the badge and the public
      // ordering all agree without a full reload.
      router.refresh()
    } catch {
      setError('Ne mogu se povezati sa serverom.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFeatured}
        title={
          isFeatured && featuredUntil
            ? `Izdvojeno do ${formatDate(featuredUntil)}`
            : `Izdvoji na ${days} dana`
        }
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs
                    font-medium transition-colors disabled:opacity-50 ${
                      isFeatured
                        ? 'border-featured bg-featured-soft text-featured'
                        : 'border-hairline-strong text-muted hover:border-featured hover:text-featured'
                    }`}
      >
        <span aria-hidden>{isFeatured ? '★' : '☆'}</span>
        {pending ? '…' : isFeatured ? 'Izdvojeno' : 'Izdvoji'}
      </button>

      {isFeatured && featuredUntil && (
        <span className="text-[11px] text-faint">
          do {formatDate(featuredUntil)}
        </span>
      )}

      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  )
}
