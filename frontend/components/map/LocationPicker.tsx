'use client'

import { useState } from 'react'
import type { Town } from 'shared'
import { ListingMap } from './ListingMap'

/**
 * Placing a listing on the map by clicking, instead of typing coordinates.
 *
 * This is the feature that lets the whole project avoid a geocoding service —
 * no API key, no per-request bill, no rate limit, and no dependency that can
 * go down. It is also more accurate here than geocoding would be: addresses in
 * small Bosnian towns geocode badly, while the person selling the house knows
 * exactly where it is.
 *
 * The chosen position is written into hidden inputs, so the surrounding form
 * reads it from FormData like any other field and needs to know nothing about
 * maps.
 */
export function LocationPicker({
  town,
  initial,
  error,
}: {
  town: Town
  initial: { lat: number; lng: number } | null
  error?: string | undefined
}) {
  const [position, setPosition] = useState(initial)

  return (
    <fieldset className="space-y-2 rounded-md border border-black/10 dark:border-white/10 p-4">
      <legend className="px-1 text-sm font-medium">Lokacija na karti</legend>

      <p className="text-sm opacity-70">
        {position
          ? 'Kliknite na drugo mjesto ili povucite oznaku da promijenite lokaciju.'
          : 'Kliknite na kartu da označite gdje se nekretnina nalazi.'}
      </p>

      {/*
        Both inputs are hidden rather than absent when unset: the form posts
        empty strings, which the parent turns into `undefined`, which the API
        reads as "no location". An absent field and an empty one mean the same
        thing here, but only because the parent is careful about it.
      */}
      <input type="hidden" name="lat" value={position?.lat ?? ''} />
      <input type="hidden" name="lng" value={position?.lng ?? ''} />

      <div className="overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        <ListingMap
          town={town}
          picker={{ value: position, onChange: setPosition }}
          className="h-72 w-full"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {position ? (
          <>
            <span className="opacity-60">
              {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </span>
            <button
              type="button"
              onClick={() => setPosition(null)}
              className="underline underline-offset-4 opacity-70 hover:opacity-100"
            >
              Ukloni lokaciju
            </button>
          </>
        ) : (
          <span className="opacity-60">Lokacija nije označena (nije obavezno).</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  )
}
