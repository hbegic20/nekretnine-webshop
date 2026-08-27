'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ListingImage } from 'shared'
import { readApiError } from '@/lib/api-client'

interface Failure {
  fileName: string
  message: string
}

/**
 * Uploads one file per request, with the File object as the raw body.
 *
 * `fetch(url, { method: 'POST', body: file })` sends the bytes directly and
 * sets Content-Type from the file — no FormData, no multipart, and so no
 * multipart parser on the server (see routes/images.ts for why that dependency
 * was avoided).
 *
 * One request per file is also better behaviour: each photo reports its own
 * error, and a failure on the fourth does not throw away the first three.
 */
export function ImageUploader({
  listingId,
  images,
  isPublished,
}: {
  listingId: string
  images: ListingImage[]
  isPublished: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [failures, setFailures] = useState<Failure[]>([])

  async function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    setFailures([])
    setUploading(files.length)

    const collected: Failure[] = []

    // Sequential, not Promise.all. Each upload decodes and re-encodes an image
    // on the server; firing fifteen at once would spike CPU and, with the rate
    // limiter, some would simply bounce. Uploading in order also preserves the
    // order the person selected them in, which becomes the gallery order.
    for (const file of files) {
      try {
        const response = await fetch(`/api/listings/${listingId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!response.ok) {
          collected.push({ fileName: file.name, message: (await readApiError(response)).message })
        }
      } catch {
        collected.push({ fileName: file.name, message: 'Slanje nije uspjelo.' })
      } finally {
        setUploading((n) => n - 1)
      }
    }

    setFailures(collected)
    // Clearing the input matters: without it, choosing the same file again
    // fires no change event and looks like the button is broken.
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  async function remove(imageId: string) {
    if (!confirm('Obrisati ovu sliku?')) return
    await fetch(`/api/images/${imageId}`, { method: 'DELETE' })
    router.refresh()
  }

  async function makeCover(imageId: string) {
    await fetch(`/api/images/${imageId}/cover`, { method: 'POST' })
    router.refresh()
  }

  return (
    <section className="space-y-3 rounded-md border border-hairline p-4">
      <h2 className="text-sm font-medium">Slike</h2>

      {isPublished && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Dodavanje ili brisanje slike vraća objavljeni oglas na ponovno odobrenje.
        </p>
      )}

      {images.length === 0 && (
        <p className="text-sm opacity-70">
          Još nema slika. Oglasi sa slikama dobiju znatno više upita.
        </p>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <li key={image.id} className="space-y-1">
              <div
                className={`overflow-hidden rounded-md border-2 ${
                  image.isCover ? 'border-foreground' : 'border-transparent'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.thumbUrl}
                  alt=""
                  width={160}
                  height={120}
                  loading="lazy"
                  className="h-24 w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-1 text-xs">
                {image.isCover ? (
                  <span className="opacity-60">Naslovna</span>
                ) : (
                  <button type="button" onClick={() => makeCover(image.id)} className="underline underline-offset-2 opacity-70 hover:opacity-100">
                    Naslovna
                  </button>
                )}
                <button type="button" onClick={() => remove(image.id)} className="underline underline-offset-2 text-red-700 dark:text-red-400">
                  Obriši
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {failures.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-red-600 dark:text-red-400">
          {failures.map((failure) => (
            <li key={failure.fileName}>
              {failure.fileName}: {failure.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onFilesChosen}
          disabled={uploading > 0}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-black/15
                     dark:file:border-white/20 file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
        />
        {uploading > 0 && (
          <span role="status" className="shrink-0 text-sm opacity-70">
            Šaljem… ({uploading})
          </span>
        )}
      </div>

      <p className="text-xs opacity-50">JPEG, PNG ili WebP. Najviše 15 slika, do 12 MB po slici.</p>
    </section>
  )
}
