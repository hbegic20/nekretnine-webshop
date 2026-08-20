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
  return new Intl.NumberFormat('bs-BA', { maximumFractionDigits: 0 }).format(km) + ' KM'
}
