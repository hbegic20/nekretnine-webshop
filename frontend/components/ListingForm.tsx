'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FIELDS_EDITABLE_WHILE_PUBLISHED,
  PROPERTY_TYPES,
  TOWNS,
  TRANSACTION_TYPES,
  type ListingDetail,
  type Town,
} from 'shared'
import { readApiError } from '@/lib/api-client'
import { Field, FormError, SubmitButton, inputClass } from './AuthFields'
import { LocationPicker } from './map/LocationPicker'

const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Stan',
  house: 'Kuća',
  land: 'Zemljište',
  commercial: 'Poslovni prostor',
  garage: 'Garaža',
}
const TRANSACTION_LABELS: Record<string, string> = { sale: 'Prodaja', rent: 'Najam' }

/**
 * Empty form field → `undefined`, not `0` and not `""`.
 *
 * `Number('')` is 0, which would quietly record a listing as having zero
 * bedrooms rather than an unknown number of them — and zero is a real answer
 * for some of these fields, so nothing downstream could tell the difference.
 */
function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? '').trim()
  if (text === '') return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text === '' ? undefined : text
}

export function ListingForm({ listing }: { listing?: ListingDetail }) {
  const router = useRouter()
  const isEdit = Boolean(listing)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  /*
   * The town select is controlled, purely so the map can follow it. Everything
   * else in this form is uncontrolled and read from FormData at submit — which
   * is less code and fewer re-renders. Lifting a single field into state
   * because something else depends on it is the cheap version of "make it
   * controlled when you must, not by default".
   */
  const [town, setTown] = useState<Town>(listing?.town ?? 'bugojno')

  /**
   * Warn before the seller submits, not after.
   *
   * Editing anything but the price on a live listing pulls it off the site
   * until an admin re-approves it. Discovering that afterwards, because the
   * listing disappeared, is the kind of surprise that makes people distrust
   * the tool.
   */
  const willLeaveTheSite = listing?.status === 'PUBLISHED'

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setPending(true)

    const f = new FormData(event.currentTarget)

    const payload = {
      title: String(f.get('title') ?? ''),
      description: String(f.get('description') ?? ''),
      price: Number(f.get('price') ?? 0),
      propertyType: String(f.get('propertyType') ?? ''),
      transactionType: String(f.get('transactionType') ?? ''),
      town: String(f.get('town') ?? ''),
      neighbourhood: optionalText(f.get('neighbourhood')),
      address: optionalText(f.get('address')),
      lat: optionalNumber(f.get('lat')),
      lng: optionalNumber(f.get('lng')),
      sizeM2: optionalNumber(f.get('sizeM2')),
      rooms: optionalNumber(f.get('rooms')),
      bedrooms: optionalNumber(f.get('bedrooms')),
      bathrooms: optionalNumber(f.get('bathrooms')),
      floor: optionalNumber(f.get('floor')),
      yearBuilt: optionalNumber(f.get('yearBuilt')),
      contactName: String(f.get('contactName') ?? ''),
      contactPhone: String(f.get('contactPhone') ?? ''),
      contactEmail: optionalText(f.get('contactEmail')),
    }

    try {
      const response = await fetch(isEdit ? `/api/listings/${listing!.id}` : '/api/listings', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const failure = await readApiError(response)
        setFieldErrors(failure.fields)
        setError(Object.keys(failure.fields).length > 0 ? null : failure.message)
        return
      }

      /*
       * push() then refresh(), not the other way round. Refreshing first
       * re-renders the form we are about to leave; refreshing after means the
       * destination is rebuilt with the listing that was just saved.
       *
       * No full reload here, because nothing in the layout changed — only the
       * page data did.
       */
      router.push('/moji-oglasi')
      router.refresh()
    } catch {
      setError('Ne mogu se povezati sa serverom.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <FormError message={error} />}

      {willLeaveTheSite && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Oglas je trenutno objavljen. Promjena bilo čega osim{' '}
          <strong>cijene</strong> vraća oglas na ponovno odobrenje i privremeno ga
          skida sa stranice.
          <span className="sr-only">
            {' '}
            Polja koja se mogu mijenjati bez ponovnog odobrenja:{' '}
            {FIELDS_EDITABLE_WHILE_PUBLISHED.join(', ')}.
          </span>
        </p>
      )}

      <Field label="Naslov" error={fieldErrors.title}>
        <input name="title" required minLength={10} maxLength={120} defaultValue={listing?.title}
               className={inputClass} placeholder="npr. Trosoban stan u centru, 78 m²" />
      </Field>

      <Field label="Opis" error={fieldErrors.description}>
        <textarea name="description" rows={6} maxLength={5000} defaultValue={listing?.description}
                  className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cijena (KM)" error={fieldErrors.price}>
          {/* step=1: prices are whole marks, see shared/src/money.ts */}
          <input name="price" type="number" required min={1} step={1}
                 defaultValue={listing?.price} className={inputClass} />
        </Field>
        <Field label="Vrsta oglasa" error={fieldErrors.transactionType}>
          <select name="transactionType" defaultValue={listing?.transactionType ?? 'sale'} className={inputClass}>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>{TRANSACTION_LABELS[t]}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Vrsta nekretnine" error={fieldErrors.propertyType}>
          <select name="propertyType" defaultValue={listing?.propertyType ?? 'apartment'} className={inputClass}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{PROPERTY_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Grad" error={fieldErrors.town}>
          <select
            name="town"
            value={town}
            onChange={(event) => setTown(event.target.value as Town)}
            className={inputClass}
          >
            {TOWNS.map((t) => (
              <option key={t.slug} value={t.slug}>{t.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Naselje" error={fieldErrors.neighbourhood}>
          <input name="neighbourhood" maxLength={100} defaultValue={listing?.neighbourhood ?? ''} className={inputClass} />
        </Field>
        <Field label="Adresa (ne prikazuje se javno)" error={fieldErrors.address}>
          <input name="address" maxLength={200} defaultValue={listing?.address ?? ''} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Površina (m²)" error={fieldErrors.sizeM2}>
          <input name="sizeM2" type="number" min={1} defaultValue={listing?.sizeM2 ?? ''} className={inputClass} />
        </Field>
        <Field label="Sobe" error={fieldErrors.rooms}>
          <input name="rooms" type="number" min={0} defaultValue={listing?.rooms ?? ''} className={inputClass} />
        </Field>
        <Field label="Sprat" error={fieldErrors.floor}>
          <input name="floor" type="number" defaultValue={listing?.floor ?? ''} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Spavaće sobe" error={fieldErrors.bedrooms}>
          <input name="bedrooms" type="number" min={0} defaultValue={listing?.bedrooms ?? ''} className={inputClass} />
        </Field>
        <Field label="Kupatila" error={fieldErrors.bathrooms}>
          <input name="bathrooms" type="number" min={0} defaultValue={listing?.bathrooms ?? ''} className={inputClass} />
        </Field>
        <Field label="Godina izgradnje" error={fieldErrors.yearBuilt}>
          <input name="yearBuilt" type="number" min={1800} defaultValue={listing?.yearBuilt ?? ''} className={inputClass} />
        </Field>
      </div>

      <LocationPicker
        town={town}
        initial={
          listing?.lat != null && listing?.lng != null
            ? { lat: listing.lat, lng: listing.lng }
            : null
        }
        error={fieldErrors.lat ?? fieldErrors.lng}
      />

      <fieldset className="space-y-4 rounded-md border border-black/10 dark:border-white/10 p-4">
        <legend className="px-1 text-sm font-medium">Kontakt</legend>
        <Field label="Ime" error={fieldErrors.contactName}>
          <input name="contactName" required defaultValue={listing?.contactName ?? ''} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Telefon" error={fieldErrors.contactPhone}>
            <input name="contactPhone" required defaultValue={listing?.contactPhone ?? ''} className={inputClass} />
          </Field>
          <Field label="Email (nije obavezno)" error={fieldErrors.contactEmail}>
            <input name="contactEmail" type="email" defaultValue={listing?.contactEmail ?? ''} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <SubmitButton pending={pending}>{isEdit ? 'Sačuvaj izmjene' : 'Kreiraj oglas'}</SubmitButton>
    </form>
  )
}
