import {
  listingFiltersToQuery,
  type ListingDetail,
  type ListingFilters,
  type ListingSummary,
  type MapPin,
  type Paginated,
} from 'shared'
import { ApiError, serverFetch, serverFetchAuthed } from './api'

/**
 * The filters are serialised back into a query string by the same /shared
 * function the URL is built with, so the request the API receives is exactly
 * the URL the user can see and share.
 */
export async function fetchPublicListings(
  filters: ListingFilters,
): Promise<Paginated<ListingSummary>> {
  return serverFetch<Paginated<ListingSummary>>(`/api/listings${listingFiltersToQuery(filters)}`)
}

/**
 * One listing, or null when it does not exist or this viewer may not see it.
 *
 * The API answers 404 for both cases on purpose — a 403 would confirm that a
 * listing with that id exists, which a stranger does not need to know. The
 * page turns either into Next's notFound().
 */
export async function fetchListing(id: string): Promise<ListingDetail | null> {
  try {
    const body = await serverFetchAuthed<{ listing: ListingDetail }>(`/api/listings/${id}`)
    return body.listing
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchOwnListings(): Promise<ListingSummary[]> {
  const body = await serverFetchAuthed<{ items: ListingSummary[] }>('/api/listings/mine')
  return body.items
}

export async function fetchMapPins(filters: ListingFilters): Promise<MapPin[]> {
  const body = await serverFetch<{ pins: MapPin[] }>(
    `/api/listings/map${listingFiltersToQuery({ ...filters, page: 1 })}`,
  )
  return body.pins
}
