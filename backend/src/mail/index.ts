import nodemailer from 'nodemailer'
import { env } from '../env.js'
import { log } from '../log.js'

/**
 * Same shape as storage: one interface, two implementations, chosen by env.
 * See ARCHITECTURE.md §6.4.
 */
export interface Message {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
}

export interface Mailer {
  readonly name: string
  send(message: Message): Promise<void>
}

/**
 * Development mailer: prints the email instead of sending it.
 *
 * The tradeoff, accepted knowingly: you will not see a real rendered email
 * until you deploy. So the very first thing to do in production is send
 * yourself a test inquiry.
 */
export class ConsoleMailer implements Mailer {
  readonly name = 'console'

  // Not `async`: there is nothing to await, and marking it async would claim
  // otherwise. Returning a resolved promise satisfies the Mailer interface.
  send(message: Message): Promise<void> {
    const divider = '─'.repeat(60)
    console.log(
      [
        divider,
        `EMAIL (not sent — MAIL_DRIVER=console)`,
        `To:      ${message.to}`,
        `From:    ${env.MAIL_FROM}`,
        message.replyTo ? `ReplyTo: ${message.replyTo}` : null,
        `Subject: ${message.subject}`,
        divider,
        message.text,
        divider,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    return Promise.resolve()
  }
}

/** Production mailer. SMTP_URL works with Resend, Postmark, Mailgun, etc. */
export class SmtpMailer implements Mailer {
  readonly name = 'smtp'
  // env.ts refuses to start without SMTP_URL when MAIL_DRIVER=smtp, so the
  // non-null assertion that used to be here was telling TypeScript something
  // it already knew.
  private readonly transport = nodemailer.createTransport(env.SMTP_URL)

  async send(message: Message): Promise<void> {
    await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    })
  }
}

export function createMailer(): Mailer {
  const mailer = env.MAIL_DRIVER === 'smtp' ? new SmtpMailer() : new ConsoleMailer()
  log.info('mailer ready', { driver: mailer.name })
  return mailer
}

export const mailer = createMailer()
