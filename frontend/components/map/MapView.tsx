'use client'

import { useEffect, useMemo, useRef } from 'react'
// Named imports: maplibre-gl v6 dropped the default export, so the familiar
// `import maplibregl from 'maplibre-gl'` from every tutorial no longer works.
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// After MapLibre's own stylesheet, and that order is the whole mechanism —
// these selectors have the same specificity as the ones they replace.
import './map-theme.css'
import { REGION_BOUNDS, TOWNS, formatPrice, type MapPin, type Town } from 'shared'
import { useThemeMode, type ThemeMode } from '@/lib/use-theme-mode'

/**
 * The map, on OpenFreeMap tiles through MapLibre.
 *
 * Two things drove the choice, after checking what is actually free in 2026.
 * Every keyless *raster* provider is gone — CARTO, Stadia, MapTiler and the
 * rest all want an API key now — and OpenStreetMap's own tiles, which this
 * used before, are donated infrastructure their policy asks production sites
 * to stay off. OpenFreeMap has no key, no request limit, permits commercial
 * use, and ships a dark style, which the OSM raster tiles never did.
 *
 * The second reason is where this is going: a basemap served from our own R2
 * bucket as a single PMTiles file is the end state, and that is MapLibre too.
 * Doing the renderer move once rather than twice is most of why it happened
 * now rather than after the deploy.
 */

/*
 * Where the tile-parsing worker lives.
 *
 * MapLibre otherwise derives this at runtime from `import.meta.url` of its own
 * bundle and asks for a sibling file — which under Next resolves to a path in
 * /_next/static/chunks that Next never emits, so the request falls through to
 * the router and returns the HTML 404 page. The browser rejects that with
 * "Failed to load module script … non-JavaScript MIME type", tiles are never
 * parsed, and the map renders as a black rectangle with perfectly working
 * markers and controls, because those are DOM and never touch the worker.
 *
 * The file is copied into public/maplibre by scripts/copy-map-worker.mjs,
 * which runs before dev and before build.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

const STYLES: Record<ThemeMode, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

const REGION_CENTER: [number, number] = [
  // MapLibre takes [lng, lat] — the opposite order to Leaflet, and the single
  // easiest thing to get wrong in this migration. Wrong order puts every pin
  // in the Indian Ocean.
  (REGION_BOUNDS.east + REGION_BOUNDS.west) / 2,
  (REGION_BOUNDS.north + REGION_BOUNDS.south) / 2,
]

export interface MapViewProps {
  pins?: MapPin[]
  /** Centre on one town instead of the whole region. */
  town?: Town | undefined
  /** Click-to-place mode, for the listing form. */
  picker?: {
    value: { lat: number; lng: number } | null
    onChange: (position: { lat: number; lng: number }) => void
  }
  className?: string
}

/**
 * A price, not a teardrop.
 *
 * Showing the price on the marker is the single most useful thing a property
 * map can do, and it is why these are HTML elements rather than image pins:
 * no sprite sheet, no icon URL for a bundler to break, and the label is styled
 * with the same classes as everything else.
 */
function priceMarker(pin: MapPin): HTMLElement {
  const el = document.createElement('span')
  el.className =
    'cursor-pointer rounded-full border border-black/20 bg-white px-2 py-1 text-xs ' +
    'font-medium text-black shadow-sm whitespace-nowrap'
  // textContent, not innerHTML: the price is ours, but keeping every marker on
  // the safe path means nobody has to remember which strings are.
  el.textContent =
    pin.transactionType === 'rent' ? `${formatPrice(pin.price)}/mj` : formatPrice(pin.price)
  return el
}

/** The pin the seller drags while placing a listing. */
function pickerMarker(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'block h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow'
  return el
}

/**
 * Popup contents built as DOM rather than an HTML string.
 *
 * `setHTML` with a listing title would be an injection hole: titles are typed
 * by sellers, and the moderation queue is not an HTML sanitiser. Building
 * nodes and assigning `textContent` cannot execute anything, so there is no
 * escaping to remember and no way to forget it.
 */
function popupContent(pin: MapPin): HTMLElement {
  const wrapper = document.createElement('div')

  const link = document.createElement('a')
  link.href = `/oglas/${pin.id}`
  link.className = 'font-medium underline underline-offset-2'
  link.textContent = pin.title

  const price = document.createElement('div')
  price.textContent =
    pin.transactionType === 'rent'
      ? `${formatPrice(pin.price)} / mjesečno`
      : formatPrice(pin.price)

  wrapper.append(link, price)
  return wrapper
}

/** ~1 metre. Storing 15 decimals implies precision a dragged pin never has. */
const round = (n: number) => Number(n.toFixed(5))

export default function MapView({ pins = [], town, picker, className }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const pinMarkers = useRef<Marker[]>([])
  const placed = useRef<Marker | null>(null)
  /** The style URL currently applied, so the theme effect can tell a real change from a re-run. */
  const appliedStyle = useRef<string | null>(null)
  const theme = useThemeMode()

  const townCentre = town ? TOWNS.find((t) => t.slug === town) : undefined
  /*
   * Memoised because it is an array, and an array is a new value on every
   * render — which would make the effect that recentres the map fire on every
   * render rather than when the town actually changes.
   */
  const center = useMemo<[number, number]>(
    () => (townCentre ? [townCentre.lng, townCentre.lat] : REGION_CENTER),
    [townCentre],
  )
  const zoom = townCentre ? 12.5 : 9.5

  /*
   * Everything the creation effect needs, in a ref.
   *
   * The map is built once and then mutated, so the effect that builds it must
   * not re-run when the theme or the centre changes — those are handled by
   * their own effects below. Reading them through a ref keeps the dependency
   * list honest rather than silencing the lint rule.
   */
  const latest = useRef({ center, zoom, theme, picker })
  // Written in an effect, not during render: a ref is not render state, and
  // React 19 refuses the assignment outright. No dependency array, so it keeps
  // up with every render.
  useEffect(() => {
    latest.current = { center, zoom, theme, picker }
  })

  useEffect(() => {
    if (!container.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: STYLES[latest.current.theme],
      center: latest.current.center,
      zoom: latest.current.zoom,
      // Matching the old behaviour, and a deliberate mobile decision: a map
      // that swallows the wheel or a two-finger scroll traps the page.
      scrollZoom: false,
      /*
       * Attribution is required by OpenFreeMap's terms, and it arrives on its
       * own — the style JSON carries none, but the `openmaptiles` source it
       * points at does, and MapLibre resolves and renders it. So this control
       * is load bearing rather than decorative: removing it removes the credit.
       */
      attributionControl: { compact: true },
    })

    appliedStyle.current = STYLES[latest.current.theme]

    /*
     * Surfaced rather than swallowed. MapLibre reports a failed style, a
     * missing sprite or a blocked tile through this event and otherwise just
     * renders an empty map — which is a genuinely confusing thing to debug
     * from the outside, since an empty map and a broken one look identical.
     */
    instance.on('error', (event) => {
      console.error('map error', event.error?.message ?? event)
    })

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    instance.on('click', (event: MapMouseEvent) => {
      const onChange = latest.current.picker?.onChange
      if (onChange) onChange({ lat: round(event.lngLat.lat), lng: round(event.lngLat.lng) })
    })

    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
  }, [])

  /*
   * Style swaps rather than a rebuild. `setStyle` keeps markers, which are DOM
   * overlays rather than style layers, so the map re-skins without the pins
   * blinking out.
   *
   * The guard is the whole point. This effect also runs on mount, moments
   * after the constructor was handed the very same URL — and calling setStyle
   * while the first style is still being fetched aborts that load. The map
   * ends up having painted the style's background layer and nothing else,
   * which looks exactly like a solid black rectangle and nothing like an
   * error.
   */
  useEffect(() => {
    const instance = map.current
    const next = STYLES[theme]
    if (!instance || appliedStyle.current === next) return

    appliedStyle.current = next
    instance.setStyle(next)
  }, [theme])

  useEffect(() => {
    // `jumpTo`, not `flyTo`: this fires when someone picks a town from the
    // filters, and animating halfway across the country is a wait, not a
    // flourish.
    map.current?.jumpTo({ center, zoom })
  }, [center, zoom])

  useEffect(() => {
    const instance = map.current
    if (!instance) return

    for (const marker of pinMarkers.current) marker.remove()
    pinMarkers.current = pins.map((pin) =>
      new Marker({ element: priceMarker(pin) })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new Popup({ offset: 16 }).setDOMContent(popupContent(pin)))
        .addTo(instance),
    )

    return () => {
      for (const marker of pinMarkers.current) marker.remove()
      pinMarkers.current = []
    }
  }, [pins])

  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const value = picker?.value
    if (!value) {
      placed.current?.remove()
      placed.current = null
      return
    }

    if (!placed.current) {
      const marker = new Marker({ element: pickerMarker(), draggable: true })
        .setLngLat([value.lng, value.lat])
        .addTo(instance)

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat()
        latest.current.picker?.onChange({ lat: round(lat), lng: round(lng) })
      })
      placed.current = marker
    } else {
      placed.current.setLngLat([value.lng, value.lat])
    }
  }, [picker?.value])

  return <div ref={container} className={className ?? 'h-[70vh] w-full rounded-lg'} />
}
