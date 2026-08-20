import Link from 'next/link'
import { formatPrice, townLabel, type ListingSummary } from 'shared'
import { StatusBadge } from './StatusBadge'

const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Stan',
  house: 'Kuća',
  land: 'Zemljište',
  commercial: 'Poslovni prostor',
  garage: 'Garaža',
}

export function ListingCard({
  listing,
  showStatus = false,
}: {
  listing: ListingSummary
  showStatus?: boolean
}) {
  const facts = [
    listing.sizeM2 ? `${listing.sizeM2} m²` : null,
    listing.bedrooms ? `${listing.bedrooms} spavaće` : null,
    listing.bathrooms ? `${listing.bathrooms} kupatilo` : null,
  ].filter(Boolean)

  return (
    <Link
      href={`/oglas/${listing.id}`}
      className="group block overflow-hidden rounded-lg border border-black/10 dark:border-white/10 transition
                 hover:border-black/30 dark:hover:border-white/30"
    >
      {listing.coverImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={listing.coverImage.thumbUrl}
          alt=""
          width={listing.coverImage.width}
          height={listing.coverImage.height}
          loading="lazy"
          /* Fixed height plus object-cover keeps every card the same size
             whatever shape the photo is — a grid of differently sized cards
             reads as broken. */
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-black/5 dark:bg-white/5">
          <span className="text-xs opacity-40">Bez slike</span>
        </div>
      )}

      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium leading-snug group-hover:underline underline-offset-4">
          {listing.title}
        </h3>
        {showStatus && <StatusBadge status={listing.status} />}
      </div>

      <p className="mt-2 text-lg font-semibold">
        {formatPrice(listing.price)}
        {listing.transactionType === 'rent' && (
          <span className="text-sm font-normal opacity-60"> / mjesečno</span>
        )}
      </p>

      <p className="mt-1 text-sm opacity-70">
        {PROPERTY_LABELS[listing.propertyType] ?? listing.propertyType} ·{' '}
        {townLabel(listing.town)}
        {listing.neighbourhood ? `, ${listing.neighbourhood}` : ''}
      </p>

      {facts.length > 0 && <p className="mt-1 text-sm opacity-60">{facts.join(' · ')}</p>}
      </div>
    </Link>
  )
}
