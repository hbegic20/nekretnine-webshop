'use client'

import dynamic from 'next/dynamic'
import type { MapViewProps } from './MapView'

/**
 * The map cannot be server-rendered.
 *
 * MapLibre reaches for `window` and `document` as soon as it measures its
 * container, and on the server neither exists — so importing it into a Server
 * Component crashes the render. `ssr: false` tells Next to skip it there and
 * load it only in the browser.
 *
 * `next/dynamic` with `ssr: false` is itself only allowed inside a Client
 * Component, which is the entire reason this thin wrapper exists: it is the
 * boundary where server rendering stops. Pages stay Server Components and the
 * map is the one island that is not.
 *
 * The cost is that the map is invisible to search engines. That is fine — the
 * listing pages carry the SEO, and nobody finds a property site by indexing a
 * map tile.
 */
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[70vh] w-full items-center justify-center rounded-lg border border-hairline"
      // Announced to screen readers, which otherwise get silence while the
      // map chunk downloads.
      role="status"
    >
      <span className="text-sm opacity-60">Učitavanje karte…</span>
    </div>
  ),
})

export function ListingMap(props: MapViewProps) {
  return <MapView {...props} />
}
