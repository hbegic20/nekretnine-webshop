'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    try {
      // POST, not GET: logging out changes state, and a GET logout can be
      // fired by anything that loads a URL — including a prefetcher or an
      // <img> tag on someone else's site.
      await fetch('/api/auth/logout', { method: 'POST' })
      router.refresh()
      router.push('/')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={pending}
      className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100 disabled:opacity-40"
    >
      Odjava
    </button>
  )
}
