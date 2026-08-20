/**
 * Bosnian plural forms.
 *
 * English has two forms and a simple rule. Bosnian (like Croatian, Serbian,
 * Russian and the other Slavic languages) has three, and the rule looks at the
 * last *two* digits:
 *
 *   1, 21, 31, 101 …  → oglas    (but NOT 11)
 *   2–4, 22–24 …      → oglasa   (but NOT 12–14)
 *   everything else   → oglasa
 *
 * The teens are the trap: 11 through 14 take the third form despite ending in
 * 1, 2, 3 and 4. Writing `count === 1 ? singular : plural` looks right on the
 * numbers you happen to test with and is wrong at 21 — which is exactly the
 * kind of thing a non-native speaker ships and a native speaker notices
 * immediately.
 *
 * For "oglas" the second and third forms are the same word, so only the first
 * is distinct. Keeping all three in the signature means nouns where they
 * differ (1 kuća / 2 kuće / 5 kuća) use the same helper.
 */
export function slavicPlural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count)
  const lastTwo = abs % 100
  const last = abs % 10

  if (last === 1 && lastTwo !== 11) return one
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}

/** "1 oglas", "3 oglasa", "11 oglasa", "21 oglas". */
export function listingsCountLabel(count: number): string {
  return `${count} ${slavicPlural(count, 'oglas', 'oglasa', 'oglasa')}`
}
