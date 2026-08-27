import type { MetadataRoute } from 'next'
import type { ListingSummary, Paginated } from 'shared'
import { serverFetch } from '@/lib/api'
import { siteUrl } from '@/lib/site'

/**
 * The sitemap, built from the live listings.
 *
 * This is the other half of the work already done in SPEC.md §7 — pages are
 * server-rendered so search engines can read them, which is worth nothing if
 * nothing tells the crawler the pages exist. A property listing is only useful
 * to a seller if buyers find it, and most of them arrive through a search
 * engine rather than by typing the address.
 *
 * Regenerated hourly rather than on every request. A crawler that visits fifty
 * times a day should not cause fifty passes over the whole listings table, and
 * a listing appearing in the sitemap up to an hour after publication is
 * invisible to everyone involved.
 */
export const revalidate = 3600

/** At 24 listings per page, enough for 1,200 — far past the ~500 in SPEC §6. */
const MAX_PAGES = 50

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      // The front page is a search: its content changes whenever anything is
      // published, which is more often than any other page here.
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/mapa`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ]

  /*
   * Deliberately absent: /login, /register, /moji-oglasi, /sacuvano and
   * /admin. The first two are worthless in search results, and the rest are
   * private — they are also disallowed in robots.ts, and listing a page in the
   * sitemap while telling crawlers not to visit it is a contradiction that
   * Search Console reports as an error.
   */

  return [...staticPages, ...(await listingEntries())]
}

async function listingEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const listings = await fetchAllPublic()

    return listings.map((listing) => ({
      url: `${siteUrl}/oglas/${listing.id}`,
      // publishedAt is when the page's content became what it is now;
      // createdAt is a fallback for anything published without a stamp.
      lastModified: new Date(listing.publishedAt ?? listing.createdAt),
      changeFrequency: 'weekly' as const,
      /*
       * Sold listings stay in the sitemap at a lower priority. They remain
       * reachable at their own URL (SPEC.md §3) and are the only price history
       * this market has, but they are not what a buyer is looking for.
       */
      priority: listing.status === 'SOLD' ? 0.4 : 0.8,
    }))
  } catch (error) {
    /*
     * A sitemap missing its listings is a bad day; a sitemap that 500s is a
     * worse one, because a crawler treats it as the site being broken and
     * backs off from everything. So if the API is unreachable — the free
     * instance waking up, say — serve the static pages and try again in an
     * hour.
     */
    console.error('sitemap: could not load listings', error)
    return []
  }
}

async function fetchAllPublic(): Promise<ListingSummary[]> {
  const collected: ListingSummary[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    /*
     * Anonymous and cached, unlike every other listings fetch in the app.
     *
     * lib/listings.ts uses serverFetchAuthed so the API can stamp each card
     * with `isFavorite` for the person looking. There is nobody looking here —
     * this runs on a timer, not in a request — and reading cookies would make
     * the route dynamic, which is exactly what `revalidate` above is avoiding.
     */
    const body = await serverFetch<Paginated<ListingSummary>>(
      `/api/listings?includeSold=1&sort=newest&page=${page}`,
      { cache: 'force-cache', next: { revalidate } },
    )

    collected.push(...body.items)

    if (body.items.length === 0 || collected.length >= body.total) break
  }

  return collected
}
