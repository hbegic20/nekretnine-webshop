import type { ListingStatus, PropertyType, TransactionType } from './listing.js'
import type { Town } from './towns.js'

/**
 * The shapes the API returns for listings.
 *
 * Two of them, on purpose. A search results page rendering 24 cards does not
 * need 24 full descriptions, contact phone numbers and image galleries — that
 * is a lot of bytes for data nothing displays. `ListingSummary` is what a card
 * needs; `ListingDetail` is what one page needs.
 *
 * Splitting them also keeps contact details off the list endpoint entirely,
 * so a scraper has to fetch pages one at a time to harvest phone numbers
 * instead of getting them 24 at a time.
 */

export interface ListingImage {
  id: string
  url: string
  thumbUrl: string
  width: number
  height: number
  isCover: boolean
}

export interface ListingSummary {
  id: string
  title: string
  price: number
  propertyType: PropertyType
  transactionType: TransactionType
  town: Town
  neighbourhood: string | null
  sizeM2: number | null
  bedrooms: number | null
  bathrooms: number | null
  status: ListingStatus
  coverImage: ListingImage | null
  publishedAt: string | null
  createdAt: string
  /**
   * Whether the *current viewer* has saved this listing.
   *
   * Optional, and absent rather than `false` for anonymous visitors. That
   * distinction is deliberate: `false` would mean "you have not saved this",
   * which is a different claim from "there is nobody to have saved it". The UI
   * uses the absence to decide whether to render a save button at all.
   */
  isFavorite?: boolean
}

/** A saved listing, plus whether it is still on the market. */
export interface FavoriteListing extends ListingSummary {
  /**
   * SPEC.md §4.6: a saved listing that later expires stays in the list,
   * marked as no longer available. Removing it silently would be worse —
   * someone would assume they never saved it.
   */
  available: boolean
}

export interface ListingDetail extends ListingSummary {
  description: string
  rooms: number | null
  floor: number | null
  yearBuilt: number | null
  address: string | null
  lat: number | null
  lng: number | null
  contactName: string
  contactPhone: string
  contactEmail: string | null
  images: ListingImage[]
  expiresAt: string | null
  soldAt: string | null
  /** Only ever sent to the listing's owner or an admin. */
  rejectionReason: string | null
}

/** What a create or edit form submits. */
export interface ListingInput {
  title: string
  description: string
  price: number
  propertyType: PropertyType
  transactionType: TransactionType
  town: Town
  neighbourhood?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  sizeM2?: number | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  floor?: number | null
  yearBuilt?: number | null
  contactName: string
  contactPhone: string
  contactEmail?: string | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  perPage: number
}

/**
 * Fields a seller may change on a PUBLISHED listing without it going back for
 * re-moderation.
 *
 * Price only. Price cuts are the most common edit by a wide margin and making
 * them wait for approval would be genuinely annoying — but everything else is
 * how a bait-and-switch works: get a clean listing approved, then rewrite the
 * title and description into something else entirely. Those changes return the
 * listing to PENDING.
 *
 * Exported so the edit form can warn "this change means your listing goes back
 * for review" *before* the seller submits it, rather than surprising them.
 */
export const FIELDS_EDITABLE_WHILE_PUBLISHED = ['price'] as const

/**
 * What a map marker needs, and nothing else.
 *
 * A map showing every match cannot be paginated — the whole point is seeing
 * the spread — so this shape is deliberately tiny. 500 of these is a few tens
 * of kilobytes; 500 `ListingSummary` objects with descriptions and image URLs
 * would be megabytes, and the map would stutter while parsing them.
 */
export interface MapPin {
  id: string
  lat: number
  lng: number
  price: number
  title: string
  transactionType: TransactionType
  propertyType: PropertyType
}

/**
 * Cap on markers returned for one map view.
 *
 * Beyond a few hundred, individual pins stop being readable anyway and the
 * right answer is clustering or server-side aggregation — neither of which is
 * worth building for a site with hundreds of listings. The cap exists so that
 * if we are ever wrong about the scale, the failure is "the map shows the
 * first 500" rather than a browser tab locking up.
 */
export const MAX_MAP_PINS = 500

/*
 * ---------------------------------------------------------------------------
 * Admin shapes
 * ---------------------------------------------------------------------------
 * Separate from the public ones because they carry things the public must
 * never see: who owns a listing, and what was paid for it. Keeping them in
 * distinct types means an admin field cannot reach a public endpoint by
 * someone widening a shared interface.
 */

export interface ListingOwner {
  id: string
  name: string
  email: string
  phone: string | null
}

export interface AdminListingSummary extends ListingSummary {
  owner: ListingOwner
  submittedAt: string
  expiresAt: string | null
}

export interface PaymentRecord {
  id: string
  /** Whole KM, same convention as listing prices. */
  amount: number
  method: string
  note: string | null
  paidAt: string
  recordedAt: string
}

export interface AdminListingDetail extends ListingDetail {
  owner: ListingOwner
  payments: PaymentRecord[]
  inquiryCount: number
  favoriteCount: number
}

/** How many listings sit in each status, for the queue's tab counts. */
export type ListingStatusCounts = Record<ListingStatus, number>

/** Payment methods offered in the approval form. Free text is still allowed. */
export const PAYMENT_METHODS = ['gotovina', 'bankovni transfer', 'ostalo'] as const
