import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { SignOutButton } from './SignOutButton'
import { ThemeToggle } from './ThemeToggle'
import { MobileMenu } from './MobileMenu'

/**
 * A Server Component, so the signed-in state is already correct in the HTML
 * that arrives. A client-side check would render "Prijava" first and then
 * flip to the user's name a moment later — the flash of signed-out content
 * that makes a site feel unfinished.
 *
 * Two layouts. Above `sm` the full row, which has space for it. Below, only
 * what a phone can hold: the brand, the theme switch, and a menu — see
 * MobileMenu. The nav is rendered twice rather than reflowed, because eight
 * items in a wrapping flex row is not a layout, it is a pile.
 */
export async function Header() {
  const user = await getCurrentUser()

  const navLink = 'text-sm text-muted transition-colors hover:text-foreground'

  return (
    /*
     * Sticky, because the search that got you here lives one click up. The
     * translucent background with a blur keeps the listings visible sliding
     * underneath rather than disappearing behind a solid bar.
     */
    <header className="sticky top-0 z-40 border-b border-hairline bg-background/85 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3.5">
        <Link href="/" className="group flex items-baseline gap-1.5">
          <span className="text-lg font-bold tracking-tight">Nekretnine</span>
          {/* The one piece of brand mark in the app: a small accent dot that
              stands in for the pin on the map. */}
          <span className="h-1.5 w-1.5 rounded-full bg-accent transition-transform group-hover:scale-125" />
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-3 sm:flex sm:gap-4">
          {user ? (
            <>
              <Link href="/sacuvano" className={navLink}>
                Sačuvano
              </Link>
              <Link href="/moji-oglasi" className={navLink}>
                Moji oglasi
              </Link>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="rounded-full border border-hairline-strong px-2 py-0.5 text-xs text-muted
                             transition-colors hover:border-accent hover:text-accent"
                >
                  admin
                </Link>
              )}
              <Link
                href="/moji-oglasi/novi"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent
                           transition-colors hover:bg-accent-hover"
              >
                Objavi oglas
              </Link>
              <span className="text-sm text-muted">{user.name}</span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={navLink}>
                Prijava
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent
                           transition-colors hover:bg-accent-hover"
              >
                Registracija
              </Link>
            </>
          )}

          <ThemeToggle />
        </div>

        {/*
          * Mobile: brand and one button, nothing else.
          *
          * The theme switch lives inside the menu rather than beside it. Three
          * 44px targets is 132px — over a third of a 360px screen — for a
          * control most people set once. In the panel it gets the room to be
          * tappable without competing with the brand for the bar.
          */}
        <MobileMenu user={user ? { name: user.name, isAdmin: user.isAdmin } : null} />
      </nav>
    </header>
  )
}
