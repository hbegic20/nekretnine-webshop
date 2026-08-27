import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listingsCountLabel, type FavoriteListing } from 'shared'
import { getCurrentUser } from '@/lib/auth'
import { serverFetchAuthed } from '@/lib/api'
import { ListingCard } from '@/components/ListingCard'

export const metadata: Metadata = { title: 'Sačuvani oglasi' }

export default async function SavedPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/sacuvano')

  const { items } = await serverFetchAuthed<{ items: FavoriteListing[] }>('/api/favorites')

  const available = items.filter((i) => i.available)
  const gone = items.filter((i) => !i.available)

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sačuvani oglasi</h1>
      <p className="mt-1 text-sm opacity-70">
        {items.length === 0 ? 'Nemate sačuvanih oglasa.' : listingsCountLabel(items.length)}
      </p>

      {items.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-hairline-strong p-8 text-center">
          <p className="text-sm opacity-70">
            Kliknite „Sačuvaj” na bilo kojem oglasu da ga dodate ovdje.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm underline underline-offset-4">
            Pregledaj oglase
          </Link>
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {available.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/*
        Listings that sold or expired stay here rather than disappearing.
        Removing them silently would leave someone certain they had saved a
        flat that has since vanished — SPEC.md §4.6.
      */}
      {gone.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-medium">Više nisu dostupni</h2>
          <p className="mt-1 text-sm opacity-60">
            Ovi oglasi su prodani ili im je isteklo vrijeme objave.
          </p>
          <div className="mt-4 grid gap-4 opacity-60 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gone.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showStatus />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
