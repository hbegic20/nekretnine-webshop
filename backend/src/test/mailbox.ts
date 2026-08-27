import { vi } from 'vitest'
import { mailer, type Message } from '../mail/index.js'

/**
 * A stand-in for the mailer, so tests can assert on what was sent.
 *
 * Installed globally rather than per test for two reasons. It keeps the real
 * ConsoleMailer from printing every notification into the test output, where
 * it buries the actual failures. And email is a side effect of half the
 * features here — an inquiry, an expiry — so "what went out" is something most
 * files want to check, and a helper beats repeating the same spy in each one.
 */
export const outbox: Message[] = []

let failure: Error | null = null

export function installMailbox(): void {
  vi.spyOn(mailer, 'send').mockImplementation((message: Message): Promise<void> => {
    if (failure) return Promise.reject(failure)
    outbox.push(message)
    return Promise.resolve()
  })
}

export function resetMailbox(): void {
  outbox.length = 0
  failure = null
}

/**
 * Make every send fail until the next reset.
 *
 * Used to prove the thing services/inquiries.ts is built around: a buyer's
 * message is stored before it is emailed, so a delivery failure loses a
 * notification rather than the message itself.
 */
export function breakMailer(error = new Error('smtp is down')): void {
  failure = error
}

/** Every message sent to this address, in order. */
export function mailTo(address: string): Message[] {
  return outbox.filter((message) => message.to === address)
}
