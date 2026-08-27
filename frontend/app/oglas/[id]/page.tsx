import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatPrice, townLabel } from 'shared'
import { fetchListing } from '@/lib/listings'
import { StatusBadge } from '@/components/StatusBadge'
import { Gallery } from '@/components/Gallery'
import { FavoriteButton } from '@/components/FavoriteButton'
import { InquiryForm } from '@/components/InquiryForm'
import { ListingMap } from '@/components/map/ListingMap'
import { ListingJsonLd } from '@/components/ListingJsonLd'

const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Stan',
  house: 'Kuća',
  land: 'Zemljište',
  commercial: 'Poslovni prostor',
  garage: 'Garaža',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const listing = await fetchListing(id)
  if (!listing) return { title: 'Oglas nije pronađen' }

  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
    // A listing page is the whole point of the site being server-rendered:
    // this is what gets shared in a WhatsApp group and indexed by Google.
    openGraph: { title: listing.title, description: listing.description.slice(0, 200) },
  }
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await fetchListing(id)

  // Covers both "no such listing" and "not yours to see" — the API does not
  // distinguish them, and neither should this page.
  if (!listing) notFound()

  /*
   * There is no ownership check here, and there should not be.
   *
   * `address` and `rejectionReason` come back as null unless the API decided
   * this viewer is the owner or an admin (services/listings.ts, `canSeePrivate`).
   * Re-deciding that in the browser would mean two implementations of the same
   * rule, and the one in the page is the one that cannot be trusted anyway —
   * anything the server sends has already left the building.
   *
   * So: render what arrived. Absence is the permission check.
   */
  const facts: Array<[string, string]> = [
    ['Vrsta', PROPERTY_LABELS[listing.propertyType] ?? listing.propertyType],
    ['Grad', townLabel(listing.town)],
    ...(listing.neighbourhood ? ([['Naselje', listing.neighbourhood]] as Array<[string, string]>) : []),
    ...(listing.sizeM2 ? ([['Površina', `${listing.sizeM2} m²`]] as Array<[string, string]>) : []),
    ...(listing.rooms !== null ? ([['Sobe', String(listing.rooms)]] as Array<[string, string]>) : []),
    ...(listing.bedrooms !== null ? ([['Spavaće sobe', String(listing.bedrooms)]] as Array<[string, string]>) : []),
    ...(listing.bathrooms !== null ? ([['Kupatila', String(listing.bathrooms)]] as Array<[string, string]>) : []),
    ...(listing.floor !== null ? ([['Sprat', String(listing.floor)]] as Array<[string, string]>) : []),
    ...(listing.yearBuilt ? ([['Godina izgradnje', String(listing.yearBuilt)]] as Array<[string, string]>) : []),
  ]

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Renders nothing for a listing the public cannot open. */}
      <ListingJsonLd listing={listing} />

      <Link href="/" className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100">
        ← Svi oglasi
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {listing.status !== 'PUBLISHED' && <StatusBadge status={listing.status} />}
          {listing.status === 'PUBLISHED' && (
            <FavoriteButton listingId={listing.id} isFavorite={listing.isFavorite} />
          )}
        </div>
      </div>

      <p className="mt-3 text-2xl font-semibold">
        {formatPrice(listing.price)}
        {listing.transactionType === 'rent' && (
          <span className="text-base font-normal opacity-60"> / mjesečno</span>
        )}
      </p>

      {listing.rejectionReason && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          <strong>Razlog odbijanja:</strong> {listing.rejectionReason}
        </p>
      )}

      <Gallery images={listing.images} title={listing.title} />

      {listing.description && (
        <p className="mt-6 whitespace-pre-line leading-relaxed">{listing.description}</p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide opacity-50">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      {listing.lat !== null && listing.lng !== null && (
        <section className="mt-10">
          <h2 className="text-sm font-medium">Lokacija</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-hairline">
            {/* One pin, centred on the listing's own town. */}
            <ListingMap
              pins={[
                {
                  id: listing.id,
                  lat: listing.lat,
                  lng: listing.lng,
                  price: listing.price,
                  title: listing.title,
                  transactionType: listing.transactionType,
                  propertyType: listing.propertyType,
                },
              ]}
              town={listing.town}
              className="h-80 w-full"
            />
          </div>
        </section>
      )}

      <section className="mt-10 rounded-lg border border-hairline p-4">
        <h2 className="text-sm font-medium">Kontakt</h2>
        <p className="mt-2 text-sm">{listing.contactName}</p>
        <p className="text-sm">
          <a href={`tel:${listing.contactPhone.replace(/\s/g, '')}`} className="underline underline-offset-4">
            {listing.contactPhone}
          </a>
        </p>
        {listing.address && (
          <p className="mt-2 text-sm opacity-60">Adresa (vidljiva samo vama): {listing.address}</p>
        )}
      </section>

      {/* Only a live listing can be enquired about — the API enforces the same
          rule, so this is presentation, not permission. */}
      {(listing.status === 'PUBLISHED' || listing.status === 'SOLD') && (
        <section className="mt-8 rounded-lg border border-hairline p-4">
          <h2 className="text-sm font-medium">Pošaljite upit</h2>
          <p className="mt-1 mb-4 text-sm opacity-70">
            Poruka ide direktno prodavcu. Vaš email vidi samo on.
          </p>
          <InquiryForm listingId={listing.id} />
        </section>
      )}
    </main>
  )
}
