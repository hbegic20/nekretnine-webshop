'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * The error boundary for everything under the root layout.
 *
 * Without it, an unhandled error renders Next's default screen: English, and
 * in production a bare "Application error: a client-side exception has
 * occurred" with no way forward. On a Bosnian site whose most likely failure
 * is the API being asleep or briefly unreachable, that reads as the site being
 * broken for good — when the honest answer is usually "try again".
 *
 * Must be a Client Component: error boundaries are a React runtime feature.
 * Note this catches errors in the page, not in the root layout itself — that
 * needs global-error.tsx, which is only worth adding if the layout ever grows
 * something that can fail.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  // Next 16 names this `retry`. It was `reset` in earlier versions, and the
  // rename is silent — the old name simply arrives as undefined, so the button
  // does nothing and nothing complains.
  retry: () => void
}) {
  useEffect(() => {
    /*
     * The only reporting this project has. `digest` is the important part: in
     * production React replaces the message with a hash, and that hash is what
     * ties this screen to the real stack trace in the server logs.
     */
    console.error('unhandled error', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Nešto je pošlo po zlu</h1>

      <p className="mx-auto mt-4 max-w-md text-sm text-muted">
        Stranicu trenutno nije moguće prikazati. Pokušajte ponovo — ako se greška ponovi,
        pokušajte za nekoliko minuta.
      </p>

      {error.digest && (
        // Shown so someone reporting the problem can quote it, and we can find
        // the matching line in the logs.
        <p className="mt-3 font-mono text-xs text-faint">Kod greške: {error.digest}</p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          Pokušaj ponovo
        </button>
        <Link
          href="/"
          className="rounded-md border border-hairline-strong px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Svi oglasi
        </Link>
      </div>
    </main>
  )
}
