import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Prijava' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  // Already signed in? Nothing here to do.
  if (await getCurrentUser()) redirect('/')

  const { next } = await searchParams

  /*
   * Only relative paths are accepted as a redirect target.
   *
   * Without this check, /login?next=https://evil.example would send someone to
   * another site straight after signing in — an open redirect, and a
   * convincing one, because the link genuinely started on our domain. The
   * `//` case matters too: `//evil.example` is a protocol-relative URL that
   * browsers treat as absolute.
   */
  const nextPath = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Prijava</h1>
      <p className="mt-1 mb-8 text-sm opacity-70">Prijavite se da sačuvate oglase.</p>

      <LoginForm nextPath={nextPath} />

      <p className="mt-6 text-sm opacity-70">
        Nemate nalog?{' '}
        <Link href="/register" className="underline underline-offset-4">
          Registrujte se
        </Link>
      </p>
    </main>
  )
}
