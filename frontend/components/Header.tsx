import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { SignOutButton } from './SignOutButton'

/**
 * A Server Component, so the signed-in state is already correct in the HTML
 * that arrives. A client-side check would render "Prijava" first and then
 * flip to the user's name a moment later — the flash of signed-out content
 * that makes a site feel unfinished.
 */
export async function Header() {
  const user = await getCurrentUser()

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Nekretnine
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/sacuvano"
                className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                Sačuvano
              </Link>
              <Link
                href="/moji-oglasi"
                className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                Moji oglasi
              </Link>
              <span className="text-sm opacity-70">{user.name}</span>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="rounded-full border border-black/15 dark:border-white/20 px-2 py-0.5 text-xs
                             hover:border-black/40 dark:hover:border-white/50"
                >
                  admin
                </Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100">
                Prijava
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
              >
                Registracija
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
