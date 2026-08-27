'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    try {
      // POST, not GET: logging out changes state, and a GET logout can be
      // fired by anything that loads a URL — including a prefetcher or an
      // <img> tag on someone else's site.
      await fetch('/api/auth/logout', { method: 'POST' })
      // Same order as signing in: land on the new route, then refresh it so
      // the root layout is rebuilt without a session.
      router.push('/')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={pending}
      // Two shapes: a quiet inline link in the desktop header, and a full-width
      // row inside the mobile menu. Same behaviour either way.
      className={
        className ??
        'text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40'
      }
    >
      Odjava
    </button>
  )
}
