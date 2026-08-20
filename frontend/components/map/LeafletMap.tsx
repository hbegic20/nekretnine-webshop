'use client'

import { useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { REGION_BOUNDS, TOWNS, formatPrice, type MapPin, type Town } from 'shared'

/**
 * Why there is no `<img src="marker.png">` anywhere in here.
 *
 * Leaflet's default marker is a PNG whose URL it builds at runtime from a base
 * path. Bundlers rewrite asset paths, so the default icon famously renders as
 * a broken image in every bundled app, and the usual fix is a block of code
 * re-pointing Leaflet at the right files.
 *
 * A `divIcon` sidesteps the problem completely: the marker is just HTML we
 * control, no image request at all. It is also better for this site — showing
 * the price on the map is the single most useful thing a property marker can
 * do, and a generic teardrop pin cannot.
 */
function priceIcon(pin: MapPin): L.DivIcon {
  const label = pin.transactionType === 'rent'
    ? `${formatPrice(pin.price)}/mj`
    : formatPrice(pin.price)

  return L.divIcon({
    className: '', // Leaflet adds styling of its own unless this is blanked.
    html: `<span class="rounded-full border border-black/20 bg-white px-2 py-1 text-xs font-medium
                        text-black shadow-sm whitespace-nowrap">${label}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

/** Recentres when the chosen town changes, without remounting the map. */
function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  map.setView(center, zoom)
  return null
}

const REGION_CENTER: [number, number] = [
  (REGION_BOUNDS.north + REGION_BOUNDS.south) / 2,
  (REGION_BOUNDS.east + REGION_BOUNDS.west) / 2,
]

export interface LeafletMapProps {
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

/** Turns a click anywhere on the map into a coordinate. */
function ClickToPlace({ onChange }: { onChange: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(event) {
      // Round to ~1 metre. Storing 15 decimal places implies a precision the
      // person dragging a pin on a phone does not have.
      onChange({
        lat: Number(event.latlng.lat.toFixed(5)),
        lng: Number(event.latlng.lng.toFixed(5)),
      })
    },
  })
  return null
}

export default function LeafletMap({ pins = [], town, picker, className }: LeafletMapProps) {
  const townCentre = town ? TOWNS.find((t) => t.slug === town) : undefined
  const center: [number, number] = townCentre ? [townCentre.lat, townCentre.lng] : REGION_CENTER
  const zoom = townCentre ? 13 : 10

  const icons = useMemo(() => new Map(pins.map((p) => [p.id, priceIcon(p)])), [pins])

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className ?? 'h-[70vh] w-full rounded-lg'}
    >
      {/*
        OpenStreetMap's own tiles, which are free and need no API key — the
        reason there is no map service in this project's dependency list.

        The attribution is not decoration: the OSM tile usage policy requires
        it, and the same policy asks that heavy or commercial use move to a
        proper tile provider. At this site's traffic we are well inside what
        the policy considers acceptable; see ARCHITECTURE.md §7.4 for the
        trigger to switch.
      */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <Recenter center={center} zoom={zoom} />

      {picker && (
        <>
          <ClickToPlace onChange={picker.onChange} />
          {picker.value && (
            <Marker
              position={[picker.value.lat, picker.value.lng]}
              draggable
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = event.target.getLatLng()
                  picker.onChange({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) })
                },
              }}
              icon={L.divIcon({
                className: '',
                html: `<span class="block h-4 w-4 -translate-x-2 -translate-y-2 rounded-full
                                     border-2 border-white bg-red-600 shadow"></span>`,
                iconSize: [0, 0],
              })}
            />
          )}
        </>
      )}

      {pins.map((pin) => (
        <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={icons.get(pin.id)!}>
          <Popup>
            <Link href={`/oglas/${pin.id}`} className="font-medium underline underline-offset-2">
              {pin.title}
            </Link>
            <br />
            {formatPrice(pin.price)}
            {pin.transactionType === 'rent' && ' / mjesečno'}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
