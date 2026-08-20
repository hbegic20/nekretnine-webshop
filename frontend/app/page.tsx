import Link from 'next/link'
import { fetchPublicListings } from '@/lib/listings'
import { ListingCard } from '@/components/ListingCard'

export const metadata = {
  description:
    'Oglasi za prodaju i najam nekretnina u Bugojnu, Gornjem Vakufu-Uskoplju, Donjem Vakufu, Jajcu, Kupresu, Travniku i Novom Travniku.',
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam ?? 1) || 1)

  const { items, total, perPage } = await fetchPublicListings(page)
  const lastPage = Math.max(1, Math.ceil(total / perPage))

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Oglasi</h1>
      <p className="mt-1 text-sm opacity-70">
        {total} {total === 1 ? 'oglas' : 'oglasa'} u ponudi.
        {/* Filters and keyword search arrive in Phase 4.3. */}
      </p>

      {items.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-black/15 dark:border-white/20 p-8 text-center text-sm opacity-70">
          Trenutno nema objavljenih oglasa.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="mt-10 flex items-center justify-between text-sm" aria-label="Stranice">
          {page > 1 ? (
            <Link href={`/?page=${page - 1}`} className="underline underline-offset-4">
              ← Prethodna
            </Link>
          ) : (
            <span className="opacity-30">← Prethodna</span>
          )}
          <span className="opacity-60">
            Stranica {page} od {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={`/?page=${page + 1}`} className="underline underline-offset-4">
              Sljedeća →
            </Link>
          ) : (
            <span className="opacity-30">Sljedeća →</span>
          )}
        </nav>
      )}
    </main>
  )
}
