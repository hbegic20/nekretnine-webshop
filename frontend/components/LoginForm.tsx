'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { readApiError } from '@/lib/api-client'
import { Field, FormError, SubmitButton, inputClass } from './AuthFields'

/**
 * A Client Component, not a Server Action, and the reason is worth knowing.
 *
 * Auth lives in the Express API, which is what sets the session cookie. A
 * Server Action would run on the Next.js server, meaning Next would have to
 * call the API, catch its `Set-Cookie` header, and re-emit it — an extra hop
 * that hides where the cookie actually comes from.
 *
 * Posting straight from the browser keeps the path honest: browser → Next.js
 * rewrite → Express, and `Set-Cookie` comes back down that same path to the
 * browser. One request, one cookie, no relaying.
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      })

      if (!response.ok) {
        setError((await readApiError(response)).message)
        return
      }

      /*
       * Navigate first, refresh second. The order is the whole fix.
       *
       * The <Header /> lives in the root layout, and the App Router
       * deliberately does not re-render a shared layout when you move between
       * routes that use it — "partial rendering". Normally that is exactly
       * what you want; here it meant the header kept showing "Prijava" after
       * a successful sign-in until the page was reloaded by hand.
       *
       * The original code called refresh() *before* push(), which refreshed
       * the page being left and then navigated using the layout it already
       * had. Refreshing after the navigation re-fetches the route we actually
       * landed on, layouts included, so the header is rebuilt with the new
       * session cookie.
       */
      router.push(nextPath)
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

      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className={inputClass}
        />
      </Field>

      <Field label="Lozinka">
        {/*
          autoComplete="current-password" is not cosmetic: it tells password
          managers this is a sign-in field, so they offer the saved password
          rather than proposing to generate a new one.
        */}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <SubmitButton pending={pending}>Prijavi se</SubmitButton>
    </form>
  )
}
