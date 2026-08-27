'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from './SignOutButton'
import { ThemeToggle } from './ThemeToggle'

/**
 * The navigation, for screens too narrow to hold it in a row.
 *
 * Signed in, the desktop header carries eight things: brand, two links, an
 * admin pill, a call to action, a name, sign-out and the theme switch. That is
 * a comfortable row at 1280px and an unreadable squeeze at 360px, which is
 * most of this site's traffic.
 *
 * Everything except the brand, the theme switch and the one action people
 * came to perform moves in here. The button itself is 44px square — the size
 * a thumb actually hits.
 */
export function MobileMenu({
  user,
}: {
  user: { name: string; isAdmin: boolean } | null
}) {
  const pathname = usePathname()
  const panel = useRef<HTMLDivElement>(null)

  /*
   * Open state is the path the menu was opened on, not a boolean.
   *
   * Client-side routing does not unmount this component, so a plain boolean
   * would leave the menu hanging open over the page it just navigated to.
   * Deriving "open" from whether the current path still matches closes it on
   * every navigation — including the back button — without an effect that sets
   * state, which React 19 rightly refuses.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const open = openedOn === pathname

  const setOpen = (next: boolean) => {
    setOpenedOn(next ? pathname : null)
  }

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenedOn(null)
    }
    function onPointer(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpenedOn(null)
    }

    document.addEventListener('keydown', onKey)
    // `pointerdown`, not `click`: a click fires after the press completes, so a
    // tap that starts outside and drags in would not close it.
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const item =
    'flex min-h-11 items-center rounded-md px-3 text-sm text-foreground transition-colors hover:bg-sunken'

  return (
    <div className="relative sm:hidden" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? 'Zatvori izbornik' : 'Otvori izbornik'}
        className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
      >
        {/* Two bars that become an X. Fewer moving parts than three. */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          {open ? (
            <>
              <path d="M5 5l10 10" />
              <path d="M15 5L5 15" />
            </>
          ) : (
            <>
              <path d="M3 6.5h14" />
              <path d="M3 13.5h14" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <nav
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-card border border-hairline
                     bg-surface p-1.5 shadow-[var(--shadow-lift)]"
          aria-label="Glavni izbornik"
        >
          {user ? (
            <>
              <p className="px-3 pb-1 pt-2 text-xs text-faint">{user.name}</p>
              <Link href="/moji-oglasi/novi" className={`${item} font-semibold text-accent`}>
                Objavi oglas
              </Link>
              <Link href="/sacuvano" className={item}>
                Sačuvano
              </Link>
              <Link href="/moji-oglasi" className={item}>
                Moji oglasi
              </Link>
              {user.isAdmin && (
                <Link href="/admin" className={item}>
                  Administracija
                </Link>
              )}
              <div className="mt-1.5 border-t border-hairline pt-1.5">
                <SignOutButton className={item} />
              </div>
            </>
          ) : (
            <>
              <Link href="/register" className={`${item} font-semibold text-accent`}>
                Registracija
              </Link>
              <Link href="/login" className={item}>
                Prijava
              </Link>
            </>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-hairline px-3 pb-1 pt-2">
            <span className="text-xs text-faint">Tema</span>
            <ThemeToggle />
          </div>
        </nav>
      )}
    </div>
  )
}
