/**
 * Dates, formatted identically on the server and in the browser.
 *
 * `toLocaleDateString('bs-BA')` looks like the obvious answer and is a
 * hydration bug in a Client Component, for two reasons at once:
 *
 *   - Node ships full ICU and a browser may not carry the same data for a
 *     locale this size, so the two can produce different strings for the same
 *     instant.
 *   - `new Date(iso).toLocaleDateString()` formats in the *local* timezone.
 *     The server is on UTC and the reader is on CEST, so for a couple of hours
 *     around midnight they disagree about which day it is.
 *
 * React then finds server HTML that does not match what the client renders,
 * and gives up on patching that subtree — including, in our case, a `title`
 * attribute, which is exactly what the warning names.
 *
 * So this does no locale work and constructs no Date. It reads the date out of
 * the ISO string and rearranges it, which cannot vary by machine. The output
 * is the Bosnian convention: 17.09.2026.
 */
export function formatDate(iso: string): string {
  const datePart = iso.split('T')[0] ?? ''
  const [year, month, day] = datePart.split('-')

  // Anything unexpected comes back untouched rather than as "undefined.
  // undefined.undefined." — a wrong date on screen is worse than a raw one.
  if (!year || !month || !day) return iso

  return `${day}.${month}.${year}.`
}
