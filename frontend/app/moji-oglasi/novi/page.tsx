import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ListingForm } from '@/components/ListingForm'

export const metadata: Metadata = { title: 'Novi oglas' }

export default async function NewListingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/moji-oglasi/novi')

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Novi oglas</h1>
      <p className="mt-1 mb-8 text-sm opacity-70">
        Oglas se prvo sprema kao nacrt. Slike dodajete nakon spremanja, a kada
        ga pošaljete na odobrenje, administrator ga pregleda prije objave.
      </p>

      <ListingForm />
    </main>
  )
}
