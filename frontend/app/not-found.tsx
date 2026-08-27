import Link from 'next/link'
import type { Metadata } from 'next'

/**
 * The 404 page.
 *
 * Reached two ways: a mistyped address, and — more often — a listing that no
 * longer exists or was never visible to this person. The detail page calls
 * notFound() for both, because the API answers 404 rather than 403 for a
 * listing someone may not see (SPEC.md §4.2), and the page cannot tell the
 * difference either. So the copy has to make sense for "this was never here"
 * and "this is gone" alike, without implying the visitor did something wrong.
 */
export const metadata: Metadata = {
  title: 'Stranica nije pronađena',
  // Nothing here is worth indexing, and a 404 in search results helps nobody.
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
      <p className="text-sm font-medium text-faint">404</p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Stranica nije pronađena</h1>

      <p className="mx-auto mt-4 max-w-md text-sm text-muted">
        Oglas koji tražite je možda uklonjen, prodan ili mu je istekao rok objave. Provjerite
        adresu ili pogledajte ostale oglase.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          Svi oglasi
        </Link>
        <Link
          href="/mapa"
          className="rounded-md border border-hairline-strong px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Pogledaj na mapi
        </Link>
      </div>
    </main>
  )
}
