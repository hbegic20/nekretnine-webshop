import { PUBLIC_STATUSES, townLabel, type ListingDetail } from 'shared'
import { siteUrl } from '@/lib/site'

/**
 * Structured data for a listing, so search engines can read the price, size
 * and location rather than guess at them from the prose.
 *
 * This is the other half of the work the sitemap started. Server-rendering the
 * pages made them readable; this tells the crawler what it is reading, which
 * is what earns the price and the location a place in the result itself.
 *
 * Two rules govern what goes in:
 *
 *   - Only public listings. A draft or a rejected listing renders no block at
 *     all — publishing structured data for something the public cannot open
 *     invites a crawl of a page that will 404 at them.
 *   - Never the street address. `address` is already withheld from anyone but
 *     the owner and an admin (SPEC.md §4.2), and it would be a strange kind of
 *     leak to keep it off the visible page and then hand it to Google in a
 *     script tag. Town, neighbourhood and the map pin are what the public gets.
 */

/** schema.org has no "garage" or "plot"; the honest fallback is a plain Place. */
const SCHEMA_TYPES: Record<string, string> = {
  apartment: 'Apartment',
  house: 'House',
  land: 'Place',
  commercial: 'Place',
  garage: 'Place',
}

export function ListingJsonLd({ listing }: { listing: ListingDetail }) {
  if (!(PUBLIC_STATUSES as readonly string[]).includes(listing.status)) return null

  const about: Record<string, unknown> = {
    '@type': SCHEMA_TYPES[listing.propertyType] ?? 'Place',
    name: listing.title,
    address: {
      '@type': 'PostalAddress',
      addressLocality: townLabel(listing.town),
      ...(listing.neighbourhood ? { addressNeighborhood: listing.neighbourhood } : {}),
      addressRegion: 'Srednjobosanski kanton',
      addressCountry: 'BA',
    },
    ...(listing.lat !== null && listing.lng !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: listing.lat, longitude: listing.lng } }
      : {}),
    // MTK is the UN/CEFACT code for square metres. Google reads the unit code,
    // not the "m²" we render for people.
    ...(listing.sizeM2
      ? { floorSize: { '@type': 'QuantitativeValue', value: listing.sizeM2, unitCode: 'MTK' } }
      : {}),
    ...(listing.rooms !== null ? { numberOfRooms: listing.rooms } : {}),
    ...(listing.bedrooms !== null ? { numberOfBedrooms: listing.bedrooms } : {}),
    ...(listing.bathrooms !== null ? { numberOfBathroomsTotal: listing.bathrooms } : {}),
    ...(listing.yearBuilt ? { yearBuilt: listing.yearBuilt } : {}),
  }

  const data = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: listing.description,
    url: `${siteUrl}/oglas/${listing.id}`,
    ...(listing.publishedAt ? { datePosted: listing.publishedAt } : {}),
    ...(listing.images.length > 0 ? { image: listing.images.map((image) => image.url) } : {}),
    offers: {
      '@type': 'Offer',
      price: listing.price,
      // BAM is the ISO 4217 code for the convertible mark. "KM" is what people
      // write; it is not a currency code and Google will ignore it.
      priceCurrency: 'BAM',
      availability:
        listing.status === 'SOLD' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      /*
       * Sale and rent are the same price field with very different meanings,
       * and this is the only way the distinction survives into a search
       * result — otherwise a 600 KM monthly rent looks like a flat selling for
       * 600 KM.
       */
      businessFunction:
        listing.transactionType === 'rent'
          ? 'http://purl.org/goodrelations/v1#LeaseOut'
          : 'http://purl.org/goodrelations/v1#Sell',
    },
    about,
  }

  return (
    <script
      type="application/ld+json"
      // JSON inside a <script> block is not HTML-escaped by the browser, so a
      // description containing "</script>" would end the tag early and the
      // rest would be parsed as markup. Escaping "<" closes that off; the
      // sequence is still valid JSON and parses back to the same string.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
