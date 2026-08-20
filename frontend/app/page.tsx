import Link from 'next/link'
import { countActiveFilters, listingFiltersToQuery, listingsCountLabel, parseListingFilters } from 'shared'
import { fetchPublicListings } from '@/lib/listings'
import { ListingCard } from '@/components/ListingCard'
import { SearchFilters } from '@/components/SearchFilters'

export const metadata = {
  description:
    'Oglasi za prodaju i najam nekretnina u Bugojnu, Gornjem Vakufu-Uskoplju, Donjem Vakufu, Jajcu, Kupresu, Travniku i Novom Travniku.',
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  /*
   * The URL is the search.
   *
   * There is no client-side filter state anywhere — the same
   * `parseListingFilters` the API uses reads the query string here, so a
   * search is shareable, bookmarkable, survives a reload, and the back button
   * does the obvious thing. All of that comes free from not keeping a second
   * copy of the state in React.
   */
  const filters = parseListingFilters(await searchParams)
  const { items, total, perPage } = await fetchPublicListings(filters)

  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const activeCount = countActiveFilters(filters)
  const pageHref = (page: number) => `/${listingFiltersToQuery({ ...filters, page })}`

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Oglasi</h1>

      <div className="mt-6">
        <SearchFilters filters={filters} />
      </div>

      <p className="mt-6 text-sm opacity-70" aria-live="polite">
        {total === 0 ? 'Nema rezultata' : listingsCountLabel(total)}
        {filters.q && <> za „{filters.q}”</>}
      </p>

      {items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-black/15 dark:border-white/20 p-8 text-center">
          <p className="text-sm opacity-70">
            {activeCount > 0
              ? 'Nijedan oglas ne odgovara vašoj pretrazi.'
              : 'Trenutno nema objavljenih oglasa.'}
          </p>
          {activeCount > 0 && (
            <Link href="/" className="mt-3 inline-block text-sm underline underline-offset-4">
              Poništi filtere
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="mt-10 flex items-center justify-between text-sm" aria-label="Stranice">
          {/* Pagination links carry the filters along — otherwise page 2 of a
              filtered search would silently show unfiltered results. */}
          {filters.page > 1 ? (
            <Link href={pageHref(filters.page - 1)} className="underline underline-offset-4">
              ← Prethodna
            </Link>
          ) : (
            <span className="opacity-30">← Prethodna</span>
          )}
          <span className="opacity-60">
            Stranica {filters.page} od {lastPage}
          </span>
          {filters.page < lastPage ? (
            <Link href={pageHref(filters.page + 1)} className="underline underline-offset-4">
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
