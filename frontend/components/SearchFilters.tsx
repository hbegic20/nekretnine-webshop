'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LISTING_SORTS,
  listingFiltersToQuery,
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
  'w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-foreground ' +
  'transition-colors placeholder:text-faint hover:border-hairline-strong ' +
  'focus:border-accent focus:outline-none'

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
  /*
   * Collapsed on a phone, always open on a desktop.
   *
   * Twelve fields between the heading and the results means scrolling past
   * five rows of form before seeing a single listing — on a page whose entire
   * job is showing listings. The search box stays out here because searching
   * is the common act; the rest is refinement.
   *
   * The fields are hidden with `display: none`, which still submits them, so a
   * search typed in the box carries whatever filters the URL already had.
   */
  const [detailsOpen, setDetailsOpen] = useState(false)
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
      /*
       * The key is what makes client-side navigation safe here.
       *
       * Every input below is uncontrolled with a `defaultValue`, and
       * defaultValue is only read when the element mounts. Under a full page
       * load that was fine. Under client navigation — pressing "Poništi
       * filtere", or the browser's back button — React reuses the same DOM
       * nodes, so the boxes would keep whatever was typed while the URL, and
       * the results, said something else.
       *
       * Keying the form on the serialised filters means a URL change is a new
       * key, React remounts the subtree, and the fields re-read from props.
       * The alternative is making all eleven inputs controlled, which is far
       * more code for the same outcome.
       */
      key={listingFiltersToQuery(filters)}
      method="get"
      action="/"
      onSubmit={onSubmit}
      className="space-y-3 rounded-card border border-hairline bg-surface p-4 shadow-[var(--shadow-card)]"
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
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Traži
        </button>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((was) => !was)}
        aria-expanded={detailsOpen}
        className="flex min-h-11 w-full items-center justify-between rounded-md border border-hairline
                   px-3 text-sm text-muted transition-colors hover:text-foreground sm:hidden"
      >
        <span>
          Filteri
          {activeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-ink">
              {activeCount}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`text-xs transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {/*
        * Animating to "auto" height, without measuring anything in JS.
        *
        * A grid row of `0fr` collapses to nothing and `1fr` expands to exactly
        * the content's height, and grid-template-rows is animatable — which
        * height:auto is not. The inner element carries overflow-hidden and
        * min-h-0 so the content is clipped rather than spilling while the row
        * is still opening.
        *
        * `invisible` rather than `hidden` when closed: display:none cannot be
        * transitioned, and visibility:hidden still keeps the fields in the form
        * (so they submit) while taking them out of the tab order and the
        * accessibility tree — which display:none would do too, but a
        * zero-height overflow-hidden box on its own would not.
        *
        * Above `sm` every one of these is overridden: the panel is simply open.
        * The blanket prefers-reduced-motion rule in globals.css turns the
        * animation off for anyone who asked for that.
        */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out
                    sm:visible sm:grid-rows-[1fr] sm:opacity-100 ${
                      detailsOpen
                        ? 'visible grid-rows-[1fr] opacity-100'
                        : 'invisible grid-rows-[0fr] opacity-0'
                    }`}
      >
      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
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

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="includeSold"
          value="1"
          defaultChecked={filters.includeSold ?? false}
          className="h-4 w-4"
        />
        Prikaži i prodane oglase
      </label>

      </div>
      </div>

      {activeCount > 0 && (
        <p className="text-sm">
          <Link href="/" className="underline underline-offset-4 opacity-70 hover:opacity-100">
            Poništi filtere ({activeCount})
          </Link>
        </p>
      )}
    </form>
  )
}
