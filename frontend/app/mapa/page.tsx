import type { Metadata } from 'next'
import Link from 'next/link'
import { MAX_MAP_PINS, listingsCountLabel, parseListingFilters } from 'shared'
import { fetchMapPins } from '@/lib/listings'
import { SearchFilters } from '@/components/SearchFilters'
import { ViewToggle } from '@/components/ViewToggle'
import { ListingMap } from '@/components/map/ListingMap'

export const metadata: Metadata = {
  title: 'Karta oglasa',
  description: 'Nekretnine na karti — Bugojno, Gornji Vakuf-Uskoplje, Donji Vakuf, Jajce, Kupres, Travnik, Novi Travnik.',
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Exactly the same parser as the list view, so a filtered search survives
  // the switch between them.
  const filters = parseListingFilters(await searchParams)
  const pins = await fetchMapPins(filters)

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Karta</h1>
        <ViewToggle filters={filters} active="map" />
      </div>

      <div className="mt-6">
        <SearchFilters filters={filters} />
      </div>

      <p className="mt-6 text-sm opacity-70" aria-live="polite">
        {pins.length === 0 ? 'Nema oglasa sa lokacijom' : `${listingsCountLabel(pins.length)} na karti`}
        {pins.length === MAX_MAP_PINS && ' (prikazano prvih ' + MAX_MAP_PINS + ')'}
      </p>

      {pins.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-hairline-strong p-8 text-center">
          <p className="text-sm opacity-70">
            Nijedan oglas koji odgovara pretrazi nema označenu lokaciju.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm underline underline-offset-4">
            Prikaži kao listu
          </Link>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-hairline">
          <ListingMap pins={pins} town={filters.town} />
        </div>
      )}

      <p className="mt-3 text-xs opacity-50">
        Oglasi bez označene lokacije se ne prikazuju na karti.
      </p>
    </main>
  )
}
