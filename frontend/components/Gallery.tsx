'use client'

import { useState } from 'react'
import type { ListingImage } from 'shared'

/*
 * Plain <img>, not next/image, and deliberately.
 *
 * next/image proxies and re-optimises remote files, which means every host the
 * images can come from has to be listed in next.config.ts — and ours change by
 * environment (localhost:4000 with the disk driver, an R2 domain in
 * production). It would also re-optimise images we have already resized and
 * converted to WebP ourselves in the upload pipeline, paying twice for the
 * same work — and on Netlify each distinct size runs through a function, in
 * the request path, on a plan with a budget.
 *
 * What next/image would otherwise give us we do by hand: explicit
 * width/height so the layout does not jump, lazy loading below the fold, and
 * — since the upload pipeline gained a mid rendition — a real srcset. The
 * browser picks from the sizes we already store, straight from the CDN, with
 * nothing to configure per environment.
 */

export function Gallery({ images, title }: { images: ListingImage[]; title: string }) {
  const cover = images.find((i) => i.isCover) ?? images[0]
  const [active, setActive] = useState(cover?.id ?? null)

  if (images.length === 0) return null

  const current = images.find((i) => i.id === active) ?? images[0]!

  return (
    <div className="mt-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          /*
           * The main image is the LCP element on this page, so this is where
           * the mid rendition earns the most: a phone shows it about 390px
           * wide and was being handed the full 1600px file.
           */
          srcSet={`${current.midUrl} 1000w, ${current.url} 1600w`}
          /* Capped by the max-w-3xl container: never wider than 768px, and
             the full viewport below that. */
          sizes="(min-width: 768px) 768px, 100vw"
          alt={title}
          width={current.width}
          height={current.height}
          /* The first image is above the fold, so it must NOT be lazy: lazy
             loading the thing someone came to see delays the only content that
             matters. Everything else stays lazy. */
          loading="eager"
          className="h-auto w-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(image.id)}
                aria-label={`Slika ${images.indexOf(image) + 1} od ${images.length}`}
                aria-current={image.id === current.id}
                className={`overflow-hidden rounded-md border-2 transition ${
                  image.id === current.id
                    ? 'border-foreground'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.thumbUrl}
                  alt=""
                  width={96}
                  height={72}
                  loading="lazy"
                  className="h-16 w-24 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
