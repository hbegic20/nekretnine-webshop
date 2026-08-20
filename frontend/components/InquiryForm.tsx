'use client'

import { useState } from 'react'
import { readApiError } from '@/lib/api-client'
import { Field, FormError, SubmitButton, inputClass } from './AuthFields'

export function InquiryForm({ listingId }: { listingId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setPending(true)

    const f = new FormData(event.currentTarget)
    const phone = String(f.get('phone') ?? '').trim()

    try {
      const response = await fetch(`/api/listings/${listingId}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(f.get('name') ?? ''),
          email: String(f.get('email') ?? ''),
          message: String(f.get('message') ?? ''),
          ...(phone ? { phone } : {}),
          website: String(f.get('website') ?? ''),
        }),
      })

      if (!response.ok) {
        const failure = await readApiError(response)
        setFieldErrors(failure.fields)
        setError(Object.keys(failure.fields).length > 0 ? null : failure.message)
        return
      }

      setSent(true)
    } catch {
      setError('Ne mogu se povezati sa serverom.')
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <p
        role="status"
        className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-3 text-sm"
      >
        Vaš upit je poslan. Prodavac će vas kontaktirati direktno.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormError message={error} />}

      {/*
        The honeypot.

        Hidden from people, left empty by them, and filled in by bots that
        submit every input they find. A non-empty value is a very strong spam
        signal, and the server discards those submissions while answering 201
        so the bot learns nothing.

        Three details make it work: `aria-hidden` keeps it away from screen
        readers, `tabIndex={-1}` keeps it out of keyboard order, and
        `autoComplete="off"` stops a password manager helpfully filling it in
        and getting a real person's message silently dropped. Positioned
        off-screen rather than `display: none`, since some bots skip fields
        that are not rendered.
      */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vaše ime" error={fieldErrors.name}>
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
      </div>

      <Field label="Telefon (nije obavezno)" error={fieldErrors.phone}>
        <input name="phone" type="tel" autoComplete="tel" className={inputClass} />
      </Field>

      <Field label="Poruka" error={fieldErrors.message}>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          defaultValue="Poštovani, zanima me ova nekretnina. Da li je još uvijek dostupna?"
          className={inputClass}
        />
      </Field>

      <SubmitButton pending={pending}>Pošalji upit</SubmitButton>
    </form>
  )
}
