import Link from 'next/link'
import { listingFiltersToQuery, type ListingFilters } from 'shared'

/**
 * Switching between list and map keeps the filters.
 *
 * Because the filters live entirely in the URL, "keeping them" is just
 * rebuilding the query string against the other path — there is no state to
 * hand over. A design where filters lived in React state would need a store,
 * or would silently reset them on the way to the map.
 */
export function ViewToggle({ filters, active }: { filters: ListingFilters; active: 'list' | 'map' }) {
  const query = listingFiltersToQuery({ ...filters, page: 1 })

  const base = 'rounded-md px-3 py-1.5 text-sm border'
  const on = 'border-transparent bg-foreground text-background'
  const off = 'border-black/15 dark:border-white/20 hover:border-black/40 dark:hover:border-white/50'

  return (
    <div className="flex gap-2" role="group" aria-label="Prikaz">
      <Link href={`/${query}`} className={`${base} ${active === 'list' ? on : off}`}
            aria-current={active === 'list' ? 'page' : undefined}>
        Lista
      </Link>
      <Link href={`/mapa${query}`} className={`${base} ${active === 'map' ? on : off}`}
            aria-current={active === 'map' ? 'page' : undefined}>
        Karta
      </Link>
    </div>
  )
}
