'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LISTING_SORTS,
  PROPERTY_TYPES,
  TOWNS,
  TRANSACTION_TYPES,
  countActiveFilters,
  type ListingFilters,
} from 'shared'

const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Stan',
  house: 'Kuća',
  land: 'Zemljište',
  commercial: 'Poslovni prostor',
  garage: 'Garaža',
}
const TRANSACTION_LABELS: Record<string, string> = { sale: 'Prodaja', rent: 'Najam' }
const SORT_LABELS: Record<string, string> = {
  relevance: 'Najrelevantnije',
  newest: 'Najnovije',
  price_asc: 'Cijena: rastuće',
  price_desc: 'Cijena: opadajuće',
}

const fieldClass =
  'w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm ' +
  'outline-none focus:border-black/40 dark:focus:border-white/50'

/**
 * A real `<form method="get">`, enhanced rather than replaced.
 *
 * Without JavaScript the browser submits it natively and the search still
 * works — the server reads the query string either way, because the URL is the
 * only state there is. What the JavaScript adds is tidier URLs: a native GET
 * submit includes every empty field (`?q=&town=&priceMin=`), which is
 * harmless but makes a shared link look broken.
 *
 * This is progressive enhancement in its cheapest useful form: the feature
 * works without the script, and the script makes it nicer.
 */
export function SearchFilters({ filters }: { filters: ListingFilters }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const activeCount = countActiveFilters(filters)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const params = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      const text = String(value).trim()
      if (text !== '') params.set(key, text)
    }
    // Changing a filter always returns to page 1. Staying on page 3 of a
    // result set that now has one page shows an empty screen, which reads as
    // "no results" rather than "wrong page".
    params.delete('page')

    const query = params.toString()
    router.push(query ? `/?${query}` : '/')
    setPending(false)
  }

  return (
    <form
      method="get"
      action="/"
      onSubmit={onSubmit}
      className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-3"
    >
      <div className="flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={filters.q ?? ''}
          placeholder="Pretraga: stan, kuća, naselje…"
          aria-label="Pretraga"
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Traži
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select name="town" defaultValue={filters.town ?? ''} aria-label="Grad" className={fieldClass}>
          <option value="">Svi gradovi</option>
          {TOWNS.map((t) => (
            <option key={t.slug} value={t.slug}>{t.label}</option>
          ))}
        </select>

        <select name="propertyType" defaultValue={filters.propertyType ?? ''} aria-label="Vrsta nekretnine" className={fieldClass}>
          <option value="">Sve vrste</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{PROPERTY_LABELS[t]}</option>
          ))}
        </select>

        <select name="transactionType" defaultValue={filters.transactionType ?? ''} aria-label="Prodaja ili najam" className={fieldClass}>
          <option value="">Prodaja i najam</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>{TRANSACTION_LABELS[t]}</option>
          ))}
        </select>

        <select name="sort" defaultValue={filters.sort} aria-label="Sortiranje" className={fieldClass}>
          {LISTING_SORTS
            // Relevance ranks against a keyword; with no keyword there is
            // nothing to rank, so the option is not offered.
            .filter((s) => s !== 'relevance' || Boolean(filters.q))
            .map((s) => (
              <option key={s} value={s}>{SORT_LABELS[s]}</option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input name="priceMin" type="number" min={0} defaultValue={filters.priceMin ?? ''}
               placeholder="Cijena od (KM)" aria-label="Cijena od" className={fieldClass} />
        <input name="priceMax" type="number" min={0} defaultValue={filters.priceMax ?? ''}
               placeholder="Cijena do (KM)" aria-label="Cijena do" className={fieldClass} />
        <input name="bedsMin" type="number" min={0} defaultValue={filters.bedsMin ?? ''}
               placeholder="Min. spavaćih" aria-label="Minimalno spavaćih soba" className={fieldClass} />
        <input name="bathsMin" type="number" min={0} defaultValue={filters.bathsMin ?? ''}
               placeholder="Min. kupatila" aria-label="Minimalno kupatila" className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input name="sizeMin" type="number" min={0} defaultValue={filters.sizeMin ?? ''}
               placeholder="Površina od (m²)" aria-label="Površina od" className={fieldClass} />
        <input name="sizeMax" type="number" min={0} defaultValue={filters.sizeMax ?? ''}
               placeholder="Površina do (m²)" aria-label="Površina do" className={fieldClass} />
      </div>

      {activeCount > 0 && (
        <p className="text-sm">
          <a href="/" className="underline underline-offset-4 opacity-70 hover:opacity-100">
            Poništi filtere ({activeCount})
          </a>
        </p>
      )}
    </form>
  )
}
