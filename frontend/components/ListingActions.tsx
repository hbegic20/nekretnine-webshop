'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALLOWED_TRANSITIONS, type ListingStatus } from 'shared'

/**
 * Which buttons a seller sees is derived from ALLOWED_TRANSITIONS in /shared —
 * the same table the API checks against.
 *
 * The alternative, hardcoding the button list here, means the UI and the API
 * hold two copies of the state machine and drift apart. Reading from one table
 * makes an impossible button impossible to render.
 *
 * This is presentation only. The API re-checks every transition, because a
 * button that is not rendered is not a button that cannot be called.
 */
export function ListingActions({ id, status }: { id: string; status: ListingStatus }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const allowed = ALLOWED_TRANSITIONS[status]

  async function act(path: string, label: string) {
    setPending(label)
    try {
      const response = await fetch(`/api/listings/${id}/${path}`, { method: 'POST' })
      if (response.ok) router.refresh()
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    // A soft delete is recoverable in the database, but not through any UI —
    // so from the seller's point of view it is permanent, and the confirm
    // should say so rather than imply an undo that does not exist.
    if (!confirm('Obrisati ovaj oglas? Nestat će sa stranice i iz vaše liste.')) return
    setPending('delete')
    try {
      const response = await fetch(`/api/listings/${id}`, { method: 'DELETE' })
      if (response.ok) router.refresh()
    } finally {
      setPending(null)
    }
  }

  const buttonClass =
    'rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 text-sm ' +
    'hover:border-black/40 dark:hover:border-white/50 disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowed.includes('PENDING') && (
        <button onClick={() => act('submit', 'submit')} disabled={pending !== null} className={buttonClass}>
          {pending === 'submit' ? '…' : status === 'EXPIRED' ? 'Obnovi oglas' : 'Pošalji na odobrenje'}
        </button>
      )}

      {allowed.includes('SOLD') && (
        <button onClick={() => act('sold', 'sold')} disabled={pending !== null} className={buttonClass}>
          {pending === 'sold' ? '…' : 'Označi kao prodano'}
        </button>
      )}

      <button onClick={remove} disabled={pending !== null} className={`${buttonClass} text-red-700 dark:text-red-400`}>
        {pending === 'delete' ? '…' : 'Obriši'}
      </button>
    </div>
  )
}
