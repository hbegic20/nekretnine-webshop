import type {
  AdminListingDetail,
  AdminListingSummary,
  ListingStatus,
  ListingStatusCounts,
  Paginated,
} from 'shared'
import { ApiError, serverFetchAuthed } from './api'

export type AdminQueue = Paginated<AdminListingSummary> & { counts: ListingStatusCounts }

export async function fetchAdminQueue(
  status: ListingStatus | undefined,
  page: number,
): Promise<AdminQueue> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return serverFetchAuthed<AdminQueue>(`/api/admin/listings${query ? `?${query}` : ''}`)
}

export async function fetchAdminListing(id: string): Promise<AdminListingDetail | null> {
  try {
    const body = await serverFetchAuthed<{ listing: AdminListingDetail }>(`/api/admin/listings/${id}`)
    return body.listing
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
