import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDate, formatPrice, townLabel } from 'shared'
import { getCurrentUser } from '@/lib/auth'
import { fetchAdminListing } from '@/lib/admin'
import { StatusBadge } from '@/components/StatusBadge'
import { Gallery } from '@/components/Gallery'
import { ModerationPanel } from '@/components/ModerationPanel'

export const metadata: Metadata = { title: 'Pregled oglasa' }

export default async function AdminListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) notFound()

  const { id } = await params
  const listing = await fetchAdminListing(id)
  if (!listing) notFound()

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/admin" className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100">
        ← Moderacija
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
        <StatusBadge status={listing.status} />
      </div>

      <p className="mt-2 text-2xl font-semibold">
        {formatPrice(listing.price)}
        {listing.transactionType === 'rent' && (
          <span className="text-base font-normal opacity-60"> / mjesečno</span>
        )}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          {/* The listing exactly as a buyer would see it — reviewing anything
              less means approving something you have not actually looked at. */}
          <Gallery images={listing.images} title={listing.title} />

          {listing.description && (
            <p className="mt-6 whitespace-pre-line leading-relaxed">{listing.description}</p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
            <Fact label="Grad" value={townLabel(listing.town)} />
            {listing.neighbourhood && <Fact label="Naselje" value={listing.neighbourhood} />}
            {listing.address && <Fact label="Adresa" value={listing.address} />}
            {listing.sizeM2 && <Fact label="Površina" value={`${listing.sizeM2} m²`} />}
            {listing.bedrooms !== null && <Fact label="Spavaće sobe" value={String(listing.bedrooms)} />}
            <Fact
              label="Lokacija"
              value={listing.lat !== null ? `${listing.lat}, ${listing.lng}` : 'nije označena'}
            />
            <Fact label="Kontakt" value={`${listing.contactName} · ${listing.contactPhone}`} />
          </dl>

          <Link
            href={`/oglas/${listing.id}`}
            className="mt-6 inline-block text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
          >
            Otvori javnu stranicu oglasa →
          </Link>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-hairline p-4">
            <h2 className="text-sm font-medium">Prodavac</h2>
            <p className="mt-2 text-sm">{listing.owner.name}</p>
            <p className="text-sm opacity-70">{listing.owner.email}</p>
            {listing.owner.phone && <p className="text-sm opacity-70">{listing.owner.phone}</p>}
            <p className="mt-3 text-sm opacity-60">
              {/* Engagement is the closest thing to evidence this queue has:
                  a listing people are responding to is worth a second look
                  before taking it down. */}
              {listing.inquiryCount} upita · {listing.favoriteCount} sačuvano
            </p>
          </section>

          <ModerationPanel listing={listing} />

          <section className="rounded-lg border border-hairline p-4">
            <h2 className="text-sm font-medium">Uplate</h2>
            {listing.payments.length === 0 ? (
              <p className="mt-2 text-sm opacity-60">Nema zabilježenih uplata.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {listing.payments.map((payment) => (
                  <li key={payment.id} className="border-b border-black/5 dark:border-white/5 pb-2 last:border-0">
                    <span className="font-medium">{formatPrice(payment.amount)}</span>{' '}
                    <span className="opacity-70">· {payment.method}</span>
                    <br />
                    <time dateTime={payment.paidAt} className="text-xs opacity-60">
                      {formatDate(payment.paidAt)}
                    </time>
                    {payment.note && <p className="text-xs opacity-60">{payment.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide opacity-50">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
