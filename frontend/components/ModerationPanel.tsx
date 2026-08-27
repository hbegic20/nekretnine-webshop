'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_EXPIRY_DAYS, PAYMENT_METHODS, type AdminListingDetail } from 'shared'
import { readApiError } from '@/lib/api-client'
import { FormError, inputClass } from './AuthFields'

/**
 * The moderation controls.
 *
 * Which of them appear is driven by the listing's current status, not by a
 * hardcoded list — the same discipline as the seller's action buttons. A
 * publish button on an already-published listing would just produce a 400
 * from the API's transition check.
 */
export function ModerationPanel({ listing }: { listing: AdminListingDetail }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [recordPayment, setRecordPayment] = useState(true)

  const canPublish = listing.status === 'PENDING'
  const canReject = listing.status === 'PENDING'
  const canTakeDown = listing.status === 'PUBLISHED'

  async function post(path: string, body: unknown, label: string) {
    setError(null)
    setPending(label)
    try {
      const response = await fetch(`/api/listings/${listing.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        setError((await readApiError(response)).message)
        return
      }
      router.refresh()
    } catch {
      setError('Ne mogu se povezati sa serverom.')
    } finally {
      setPending(null)
    }
  }

  async function onApprove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)

    const expiryDays = Number(f.get('expiryDays') ?? DEFAULT_EXPIRY_DAYS)
    const amount = Number(f.get('amount') ?? 0)

    await post(
      'publish',
      {
        expiryDays,
        /*
         * The payment is only sent when it was actually taken. An amount of 0
         * recorded as a payment would be a lie in the ledger — "they paid
         * nothing" and "we did not charge them" are different facts, and only
         * the second one is true for a free renewal.
         */
        ...(recordPayment
          ? {
              payment: {
                amount,
                method: String(f.get('method') ?? 'gotovina'),
                paidAt: String(f.get('paidAt') ?? new Date().toISOString().slice(0, 10)),
                note: String(f.get('note') ?? '') || undefined,
              },
            }
          : {}),
      },
      'publish',
    )
  }

  async function onReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '')
    await post('reject', { reason }, 'reject')
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="space-y-5 rounded-lg border border-hairline p-4">
      <h2 className="text-sm font-medium">Moderacija</h2>

      {error && <FormError message={error} />}

      {!canPublish && !canReject && !canTakeDown && (
        <p className="text-sm opacity-70">
          Za ovaj status nema dostupnih radnji.
        </p>
      )}

      {canPublish && (
        <form onSubmit={onApprove} className="space-y-3 rounded-md border border-green-600/30 p-3">
          <h3 className="text-sm font-medium">Odobri i objavi</h3>

          <label className="block text-sm">
            Trajanje objave (dana)
            <input
              name="expiryDays"
              type="number"
              min={1}
              max={365}
              defaultValue={DEFAULT_EXPIRY_DAYS}
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recordPayment}
              onChange={(e) => setRecordPayment(e.target.checked)}
              className="h-4 w-4"
            />
            Zabilježi uplatu
          </label>

          {recordPayment && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Iznos (KM)
                <input name="amount" type="number" min={1} step={1} defaultValue={30} required className={inputClass} />
              </label>
              <label className="block text-sm">
                Način plaćanja
                <select name="method" defaultValue="gotovina" className={inputClass}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Datum uplate
                <input name="paidAt" type="date" defaultValue={today} className={inputClass} />
              </label>
              <label className="block text-sm">
                Napomena
                <input name="note" maxLength={500} className={inputClass} />
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending === 'publish' ? 'Objavljujem…' : 'Odobri i objavi'}
          </button>
        </form>
      )}

      {(canReject || canTakeDown) && (
        <form onSubmit={onReject} className="space-y-3 rounded-md border border-red-500/30 p-3">
          <h3 className="text-sm font-medium">{canTakeDown ? 'Skini sa stranice' : 'Odbij'}</h3>
          <p className="text-sm opacity-70">
            {/* A rejection without an explanation gives the seller nothing to
                act on, which is why the API requires the reason rather than
                accepting an empty one. */}
            Razlog vidi prodavac. Nakon izmjene može ponovo poslati oglas.
          </p>
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            placeholder="npr. Nedostaju slike i tačna lokacija."
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 disabled:opacity-50"
          >
            {pending === 'reject' ? 'Šaljem…' : canTakeDown ? 'Skini sa stranice' : 'Odbij oglas'}
          </button>
        </form>
      )}
    </section>
  )
}
