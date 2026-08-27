import Link from 'next/link'
import { formatPrice, townLabel, type ListingSummary } from 'shared'
import { StatusBadge } from './StatusBadge'
import { FavoriteButton } from './FavoriteButton'

const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Stan',
  house: 'Kuća',
  land: 'Zemljište',
  commercial: 'Poslovni prostor',
  garage: 'Garaža',
}

/** How long a listing counts as new. Two days of being worth a second look. */
const NEW_FOR_HOURS = 48

function isNew(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  return Date.now() - new Date(publishedAt).getTime() < NEW_FOR_HOURS * 60 * 60 * 1000
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
    /*
     * The card is a link and the heart is a button. Nesting a <button> inside
     * an <a> is invalid HTML and browsers handle it inconsistently — the click
     * usually navigates instead of toggling. So the heart sits as a sibling,
     * positioned over the card.
     */
    <div className="group relative">
      {listing.status === 'PUBLISHED' && (
        <FavoriteButton
          listingId={listing.id}
          isFavorite={listing.isFavorite}
          compact
          className="absolute right-2.5 top-2.5 z-10"
        />
      )}

      <Link
        href={`/oglas/${listing.id}`}
        /*
         * Featured cards get a border, not a different background. A tinted
         * card would make the photograph — the thing that actually sells the
         * listing — sit on a coloured field, and the whole point of paying is
         * that your photo is the one people look at.
         */
        className={`block overflow-hidden rounded-card bg-surface shadow-[var(--shadow-card)]
                    transition duration-200 hover:-translate-y-[3px] hover:shadow-[var(--shadow-lift)] ${
                      listing.isFeatured
                        ? 'border-2 border-featured/60 hover:border-featured'
                        : 'border border-hairline hover:border-hairline-strong'
                    }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-sunken">
          {listing.coverImage ? (
            /*
             * The photo scales inside a fixed frame on hover rather than the
             * frame growing — the grid stays still and only the image moves.
             * An aspect ratio instead of a fixed height means the photo keeps
             * its shape as the column width changes.
             */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listing.coverImage.thumbUrl}
              /*
               * Two candidates, and the browser picks by its own pixel
               * density and the `sizes` hint below.
               *
               * This is what the mid rendition exists for. A card is roughly
               * 285px wide in the four-column grid and 345px on a phone; at
               * 2-3x that wants 700-1000 real pixels, so the 480px thumbnail
               * alone was arriving soft on exactly the devices most people
               * browse on, while the 1600px original would be four times more
               * data than the card can show.
               */
              srcSet={`${listing.coverImage.thumbUrl} 480w, ${listing.coverImage.midUrl} 1000w`}
              /*
               * `sizes` must mirror the grid in page.tsx, because the browser
               * chooses before any CSS has been applied — it cannot measure
               * the card, it can only read this. Get it wrong and it downloads
               * the wrong file with complete confidence.
               */
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              alt=""
              width={listing.coverImage.width}
              height={listing.coverImage.height}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.045]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-xs text-faint">Bez slike</span>
            </div>
          )}

          {/*
            * One badge, not two. A card carrying both "Izdvojeno" and "Novo"
            * spends its most valuable corner on decoration — and a featured
            * listing is new often enough that the pair would be common.
            * Featured wins because somebody paid for it.
            */}
          {listing.isFeatured ? (
            <span className="absolute left-2.5 top-2.5 rounded-sm bg-featured px-1.5 py-0.5 text-[11px] font-semibold text-on-featured">
              Izdvojeno
            </span>
          ) : (
            isNew(listing.publishedAt) &&
            listing.status === 'PUBLISHED' && (
              <span className="absolute left-2.5 top-2.5 rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-on-accent">
                Novo
              </span>
            )
          )}
        </div>

        <div className="flex flex-col gap-1 p-3.5">
          <div className="flex items-start justify-between gap-2">
            {/* The price leads, in the serif and with tabular figures so a
                column of cards lines up down the page. It is the number
                everyone is scanning for. */}
            <p className="font-serif text-xl font-bold leading-none tracking-tight text-accent tabular">
              {formatPrice(listing.price)}
              {listing.transactionType === 'rent' && (
                <span className="font-sans text-xs font-normal text-muted"> / mj.</span>
              )}
            </p>
            {showStatus && <StatusBadge status={listing.status} />}
          </div>

          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">
            {listing.title}
          </h3>

          <p className="text-[13px] text-muted">
            {PROPERTY_LABELS[listing.propertyType] ?? listing.propertyType} ·{' '}
            {townLabel(listing.town)}
            {listing.neighbourhood ? `, ${listing.neighbourhood}` : ''}
          </p>

          {facts.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-hairline pt-2 text-xs text-muted tabular">
              {facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </p>
          )}
        </div>
      </Link>
    </div>
  )
}
