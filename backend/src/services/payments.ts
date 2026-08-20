import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { payments, type Payment } from '../db/schema.js'
import { log } from '../log.js'

export interface RecordPaymentInput {
  listingId: string
  recordedByUserId: string
  /** Whole KM, same convention as listings.price. */
  amount: number
  method: string
  paidAt: Date
  note?: string | undefined
}

/**
 * Records money that already changed hands somewhere else.
 *
 * Worth being clear about what this is not: it does not charge anyone, verify
 * anything, or talk to a payment provider. Someone paid by bank transfer or in
 * cash, and an admin is writing that down. The app never touches money
 * (SPEC.md §1) — this table is a ledger, not a payment system.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const rows = await db
    .insert(payments)
    .values({
      listingId: input.listingId,
      recordedByUserId: input.recordedByUserId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      note: input.note ?? null,
    })
    .returning()

  const payment = rows[0]
  if (!payment) throw new Error('insert returned no row')

  log.info('payment recorded', {
    listingId: input.listingId,
    amount: input.amount,
    method: input.method,
  })
  return payment
}

export async function listPaymentsForListing(listingId: string): Promise<Payment[]> {
  return db.select().from(payments).where(eq(payments.listingId, listingId)).orderBy(desc(payments.paidAt))
}
