'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PASSWORD_MIN_LENGTH } from 'shared'
import { readApiError } from '@/lib/api-client'
import { Field, FormError, SubmitButton, inputClass } from './AuthFields'

export function RegisterForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setPending(true)

    const form = new FormData(event.currentTarget)
    const phone = String(form.get('phone') ?? '').trim()

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          // Omit rather than send "" — the API treats the field as optional,
          // and an empty string is a value, not an absence.
          ...(phone ? { phone } : {}),
        }),
      })

      if (!response.ok) {
        const failure = await readApiError(response)
        setFieldErrors(failure.fields)
        // With per-field messages shown inline, a banner repeating them is
        // noise. Only show it when the error belongs to no single field.
        setError(Object.keys(failure.fields).length > 0 ? null : failure.message)
        return
      }

      // Registration signs you in, so it needs the same navigate-then-refresh
      // order as the login form — see the note there.
      router.push('/')
      router.refresh()
    } catch {
      setError('Ne mogu se povezati sa serverom. Provjerite konekciju.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormError message={error} />}

      <Field label="Ime i prezime" error={fieldErrors.name}>
        <input name="name" type="text" autoComplete="name" required autoFocus className={inputClass} />
      </Field>

      <Field label="Email" error={fieldErrors.email}>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>

      <Field label="Telefon (nije obavezno)" error={fieldErrors.phone}>
        <input name="phone" type="tel" autoComplete="tel" className={inputClass} />
      </Field>

      <Field label="Lozinka" error={fieldErrors.password}>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          className={inputClass}
        />
        <span className="mt-1 block text-xs opacity-60">
          Najmanje {PASSWORD_MIN_LENGTH} znakova.
        </span>
      </Field>

      <SubmitButton pending={pending}>Registruj se</SubmitButton>
    </form>
  )
}
