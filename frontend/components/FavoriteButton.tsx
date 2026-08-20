'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * The save button.
 *
 * `isFavorite === undefined` means nobody is signed in — the API omits the
 * field entirely for anonymous callers rather than sending `false`. So the
 * button becomes a link to sign in, carrying the current page as `next` so
 * people land back where they were instead of on the home page.
 */
export function FavoriteButton({
  listingId,
  isFavorite,
  className = '',
}: {
  listingId: string
  isFavorite?: boolean | undefined
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [saved, setSaved] = useState(isFavorite ?? false)
  const [pending, setPending] = useState(false)

  const base =
    'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ' +
    'border-black/15 dark:border-white/20 hover:border-black/40 dark:hover:border-white/50'

  if (isFavorite === undefined) {
    return (
      <a href={`/login?next=${encodeURIComponent(pathname)}`} className={`${base} ${className}`}>
        <Heart filled={false} /> Sačuvaj
      </a>
    )
  }

  async function toggle() {
    const next = !saved
    /*
     * Optimistic: flip the heart before the request returns, and put it back
     * if the request fails.
     *
     * A save button that waits ~100ms before responding feels broken, and this
     * is exactly the kind of action where optimism is safe — the operation is
     * idempotent and trivially reversible, so a wrong guess costs nothing but
     * a flicker.
     */
    setSaved(next)
    setPending(true)

    try {
      const response = await fetch(`/api/favorites/${listingId}`, {
        method: next ? 'PUT' : 'DELETE',
      })
      if (!response.ok) {
        setSaved(!next)
        return
      }
      // Refresh so the saved-listings page and any other view of this listing
      // agree with what the heart now shows.
      router.refresh()
    } catch {
      setSaved(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className={`${base} ${saved ? 'border-red-500/50' : ''} ${className}`}
    >
      <Heart filled={saved} />
      {saved ? 'Sačuvano' : 'Sačuvaj'}
    </button>
  )
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      className={filled ? 'text-red-600 dark:text-red-400' : ''}
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.7-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}
