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
 *
 * Two shapes: `compact` is the circle that sits over a card's photo, and the
 * default is the labelled button on a detail page. Same behaviour either way.
 */
export function FavoriteButton({
  listingId,
  isFavorite,
  className = '',
  compact = false,
}: {
  listingId: string
  isFavorite?: boolean | undefined
  className?: string
  compact?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [saved, setSaved] = useState(isFavorite ?? false)
  const [pending, setPending] = useState(false)
  /*
   * Drives the spring. Kept as state rather than a CSS :active rule because it
   * has to fire on the transition into "saved" only — springing when someone
   * un-saves would celebrate the wrong thing.
   */
  const [popped, setPopped] = useState(false)

  const shape = compact
    ? 'inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-white/40 ' +
      'bg-white/85 text-[#4b4b4b] shadow-sm backdrop-blur hover:bg-white ' +
      'dark:border-white/10 dark:bg-black/55 dark:text-white/80 dark:hover:bg-black/75'
    : 'inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 ' +
      'text-sm transition-colors hover:border-accent hover:text-accent'

  if (isFavorite === undefined) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className={`${shape} ${className}`}
        aria-label="Prijavite se da sačuvate oglas"
        title="Prijavite se da sačuvate oglas"
      >
        <Heart filled={false} />
        {!compact && 'Sačuvaj'}
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
    if (next) {
      setPopped(true)
      setTimeout(() => setPopped(false), 280)
    }

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
      aria-label={saved ? 'Ukloni iz sačuvanih' : 'Sačuvaj oglas'}
      className={`${shape} ${className} transition-transform duration-200 ${
        popped ? 'scale-[1.28]' : 'scale-100'
      } ${saved && !compact ? 'border-danger text-danger' : ''}`}
      // The overshoot-and-settle curve. Linear would read as a glitch; this
      // reads as a response.
      style={popped ? { transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' } : undefined}
    >
      <Heart filled={saved} />
      {!compact && (saved ? 'Sačuvano' : 'Sačuvaj')}
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
      className={filled ? 'text-[#d4344a]' : ''}
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.7-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}
