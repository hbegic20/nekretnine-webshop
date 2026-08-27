import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LISTING_STATUSES, formatPrice, townLabel, type ListingStatus } from 'shared'
import { getCurrentUser } from '@/lib/auth'
import { fetchAdminQueue } from '@/lib/admin'
import { StatusBadge } from '@/components/StatusBadge'
import { FeatureToggle } from '@/components/FeatureToggle'

export const metadata: Metadata = { title: 'Moderacija' }

const TAB_LABELS: Record<ListingStatus, string> = {
  PENDING: 'Čeka odobrenje',
  PUBLISHED: 'Objavljeni',
  REJECTED: 'Odbijeni',
  DRAFT: 'Nacrti',
  EXPIRED: 'Istekli',
  SOLD: 'Prodani',
}

// PENDING first: it is the only tab with work waiting in it.
const TAB_ORDER: ListingStatus[] = ['PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'SOLD', 'DRAFT']

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const user = await getCurrentUser()
  /*
   * notFound(), not redirect('/login').
   *
   * For someone who is signed in but not an admin, a redirect to the login
   * page is confusing — they are already logged in. And for anyone probing,
   * a 404 says less than "you must be an admin", which confirms the page is
   * real. The API enforces this independently; this only decides what to
   * render.
   */
  if (!user?.isAdmin) notFound()

  const { status: rawStatus, page: rawPage } = await searchParams
  const status = (LISTING_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as ListingStatus)
    : 'PENDING'
  const page = Math.max(1, Number(rawPage ?? 1) || 1)

  const queue = await fetchAdminQueue(status, page)
  const lastPage = Math.max(1, Math.ceil(queue.total / queue.perPage))

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Moderacija</h1>
      <p className="mt-1 text-sm opacity-70">
        Pregledajte oglase, zabilježite uplatu i objavite ih.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Status">
        {TAB_ORDER.map((tab) => {
          const count = queue.counts[tab]
          const active = tab === status
          return (
            <Link
              key={tab}
              href={`/admin?status=${tab}`}
              aria-current={active ? 'page' : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                active
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-hairline-strong hover:border-accent'
              }`}
            >
              {TAB_LABELS[tab]}{' '}
              <span className={active ? 'opacity-70' : 'opacity-50'}>{count}</span>
            </Link>
          )
        })}
      </nav>

      {queue.items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-hairline-strong p-8 text-center text-sm opacity-70">
          {status === 'PENDING' ? 'Nema oglasa koji čekaju odobrenje.' : 'Nema oglasa u ovom statusu.'}
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {queue.items.map((listing) => (
            <li key={listing.id} className="rounded-lg border border-hairline p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/oglas/${listing.id}`}
                    className="font-medium hover:underline underline-offset-4"
                  >
                    {listing.title}
                  </Link>
                  <p className="mt-1 text-sm opacity-70">
                    {formatPrice(listing.price)} · {townLabel(listing.town)}
                  </p>
                  <p className="mt-1 text-sm opacity-60">
                    {listing.owner.name} · {listing.owner.email}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge status={listing.status} />
                  <time
                    dateTime={listing.submittedAt}
                    className="text-xs opacity-50"
                    title={listing.submittedAt}
                  >
                    {new Date(listing.submittedAt).toLocaleDateString('bs-BA')}
                  </time>

                  {/* Choosing what leads the grid is a judgement about the
                      whole page, so it belongs in the list rather than only on
                      the review screen. Live listings only — the API refuses
                      the rest. */}
                  {listing.status === 'PUBLISHED' && (
                    <FeatureToggle
                      listingId={listing.id}
                      isFeatured={listing.isFeatured}
                      featuredUntil={listing.featuredUntil}
                    />
                  )}
                </div>
              </div>

              <Link
                href={`/admin/oglas/${listing.id}`}
                className="mt-3 inline-block rounded-md border border-hairline-strong px-3 py-1.5 text-sm
                           hover:border-accent"
              >
                Pregledaj
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label="Stranice">
          {page > 1 ? (
            <Link href={`/admin?status=${status}&page=${page - 1}`} className="underline underline-offset-4">
              ← Prethodna
            </Link>
          ) : (
            <span className="opacity-30">← Prethodna</span>
          )}
          <span className="opacity-60">Stranica {page} od {lastPage}</span>
          {page < lastPage ? (
            <Link href={`/admin?status=${status}&page=${page + 1}`} className="underline underline-offset-4">
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
