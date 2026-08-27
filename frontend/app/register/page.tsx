import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { RegisterForm } from '@/components/RegisterForm'

export const metadata: Metadata = { title: 'Registracija' }

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/')

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Registracija</h1>
      <p className="mt-1 mb-8 text-sm opacity-70">
        Napravite nalog da sačuvate oglase ili objavite svoju nekretninu.
      </p>

      <RegisterForm />

      <p className="mt-6 text-sm opacity-70">
        Već imate nalog?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Prijavite se
        </Link>
      </p>
    </main>
  )
}
