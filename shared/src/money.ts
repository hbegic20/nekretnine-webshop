/**
 * Prices are stored as a plain integer number of KM (BAM) — no decimals.
 *
 * Why not a decimal or float: floats cannot represent money exactly, and a
 * numeric/decimal column comes back from the driver as a string, which then
 * has to be parsed everywhere it is used. Property prices and monthly rents in
 * this market are always whole marks, so the fractional part buys us nothing
 * and costs us a whole class of bugs.
 *
 * If a fractional price is ever genuinely needed, the fix is to switch to an
 * integer count of fenings (1 KM = 100) rather than to a decimal type.
 */
export function formatPrice(km: number): string {
  /*
   * Grouped by hand rather than with Intl, for the same reason formatDate
   * exists: `Intl.NumberFormat('bs-BA')` gives "169.000" on a server with full
   * ICU and "169,000" in a browser that has no data for a locale this small
   * and quietly falls back to en-US.
   *
   * That was visible on the map: server-rendered cards read "145.000 KM" while
   * markers rendered in the browser read "169,000 KM" on the same screen. It
   * is also a hydration mismatch waiting to happen anywhere a price is
   * rendered on both sides.
   *
   * The rule is one line — group thousands with a dot — and the whole market
   * writes it that way, so hand-rolling it costs nothing and cannot vary by
   * machine.
   */
  const rounded = Math.round(km)
  const sign = rounded < 0 ? '-' : ''
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${sign}${grouped} KM`
}
