import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { fetchListing } from '@/lib/listings'
import { ListingForm } from '@/components/ListingForm'
import { ImageUploader } from '@/components/ImageUploader'

export const metadata: Metadata = { title: 'Uredi oglas' }

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=/moji-oglasi/${id}/uredi`)

  const listing = await fetchListing(id)
  // fetchListing already ran as this user, so a listing that is not theirs
  // comes back as null — no separate ownership check needed here.
  if (!listing) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Uredi oglas</h1>
      <p className="mt-1 mb-8 text-sm opacity-70">{listing.title}</p>

      <div className="mb-8">
        <ImageUploader
          listingId={listing.id}
          images={listing.images}
          isPublished={listing.status === 'PUBLISHED'}
        />
      </div>

      <ListingForm listing={listing} />
    </main>
  )
}
