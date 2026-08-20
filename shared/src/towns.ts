/**
 * The seven towns this site covers.
 *
 * Town is a fixed list, not free text. That is a product decision with two
 * consequences worth knowing:
 *   - filtering is an exact match on an indexed column, not a fuzzy string search
 *   - the map knows where to centre when a buyer picks a town
 *
 * Adding a town later is a migration (the `town` column is a Postgres enum),
 * which is deliberate friction — it keeps typos out of the data.
 *
 * NOTE: these centre coordinates are approximate, good enough to centre a map
 * on. Verify them before launch if precision starts to matter.
 */
export const TOWNS = [
  { slug: 'bugojno', label: 'Bugojno', lat: 44.0575, lng: 17.4506 },
  { slug: 'gornji-vakuf-uskoplje', label: 'Gornji Vakuf-Uskoplje', lat: 43.9372, lng: 17.5847 },
  { slug: 'donji-vakuf', label: 'Donji Vakuf', lat: 44.1447, lng: 17.4067 },
  { slug: 'jajce', label: 'Jajce', lat: 44.3417, lng: 17.2708 },
  { slug: 'kupres', label: 'Kupres', lat: 43.9931, lng: 17.2789 },
  { slug: 'travnik', label: 'Travnik', lat: 44.2264, lng: 17.6656 },
  { slug: 'novi-travnik', label: 'Novi Travnik', lat: 44.1675, lng: 17.6567 },
] as const

export type Town = (typeof TOWNS)[number]['slug']

/**
 * The slugs as a non-empty tuple. The cast is needed because `.map()` returns a
 * plain array, while Drizzle's `pgEnum` requires a tuple with at least one
 * member so it can type the column as a union rather than as `string`.
 */
export const TOWN_SLUGS = TOWNS.map((t) => t.slug) as unknown as readonly [Town, ...Town[]]

export function townLabel(slug: Town): string {
  return TOWNS.find((t) => t.slug === slug)?.label ?? slug
}

/** Roughly the bounding box containing all seven towns, for the default map view. */
export const REGION_BOUNDS = {
  south: 43.85,
  west: 17.15,
  north: 44.45,
  east: 17.80,
} as const

/**
 * Is this coordinate plausibly in our region?
 *
 * The site covers seven towns in one small area, so a pin dropped in Australia
 * is a bug or an abusive submission, not a listing. Rejecting it keeps the map
 * from zooming out to fit a point nobody meant to place.
 *
 * The padding is generous on purpose — a house genuinely outside the town
 * centres but still in the area should not be refused. This is a sanity check,
 * not a property boundary.
 */
export function isWithinRegion(lat: number, lng: number, paddingDegrees = 0.5): boolean {
  return (
    lat >= REGION_BOUNDS.south - paddingDegrees &&
    lat <= REGION_BOUNDS.north + paddingDegrees &&
    lng >= REGION_BOUNDS.west - paddingDegrees &&
    lng <= REGION_BOUNDS.east + paddingDegrees
  )
}
