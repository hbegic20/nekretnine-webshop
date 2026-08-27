import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatPrice, townLabel } from 'shared'
import { getCurrentUser } from '@/lib/auth'
import { fetchOwnListings } from '@/lib/listings'
import { StatusBadge } from '@/components/StatusBadge'
import { ListingActions } from '@/components/ListingActions'

export const metadata: Metadata = { title: 'Moji oglasi' }

export default async function MyListingsPage() {
  const user = await getCurrentUser()
  // `next` is preserved so signing in returns here rather than to the home page.
  if (!user) redirect('/login?next=/moji-oglasi')

  const listings = await fetchOwnListings()

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Moji oglasi</h1>
        <Link
          href="/moji-oglasi/novi"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Novi oglas
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-hairline-strong p-8 text-center text-sm opacity-70">
          Još nemate oglasa.{' '}
          <Link href="/moji-oglasi/novi" className="underline underline-offset-4">
            Kreirajte prvi
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="rounded-lg border border-hairline p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/oglas/${listing.id}`} className="font-medium hover:underline underline-offset-4">
                    {listing.title}
                  </Link>
                  <p className="mt-1 text-sm opacity-70">
                    {formatPrice(listing.price)} · {townLabel(listing.town)}
                  </p>
                </div>
                <StatusBadge status={listing.status} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/moji-oglasi/${listing.id}/uredi`}
                  className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm
                             hover:border-accent"
                >
                  Uredi
                </Link>
                <ListingActions id={listing.id} status={listing.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
