import type { ListingDetail, ListingSummary, Paginated } from 'shared'
import { ApiError, serverFetch, serverFetchAuthed } from './api'

export async function fetchPublicListings(page = 1): Promise<Paginated<ListingSummary>> {
  return serverFetch<Paginated<ListingSummary>>(`/api/listings?page=${page}`)
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
