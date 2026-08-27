import type { ListingStatus } from 'shared'

/**
 * Colour is not the only signal here — each status also has distinct text.
 * Roughly one man in twelve has some form of colour blindness, and a badge
 * that is only distinguishable by hue is invisible to them. The dot adds a
 * third channel: position and fill, readable at a glance across a column of
 * cards even when the words are too small to read.
 *
 * The colours come from the semantic tokens, deliberately not from the accent.
 * Brand colour and "this means something" colour are different jobs, and using
 * the accent for a status would make every published listing look promoted.
 */
const LABELS: Record<ListingStatus, { text: string; className: string; dot: string }> = {
  DRAFT: {
    text: 'Nacrt',
    className: 'border-hairline-strong text-muted',
    dot: 'bg-faint',
  },
  PENDING: {
    text: 'Čeka odobrenje',
    className: 'border-warn/40 bg-warn-soft text-warn',
    dot: 'bg-warn',
  },
  REJECTED: {
    text: 'Odbijen',
    className: 'border-danger/40 bg-danger-soft text-danger',
    dot: 'bg-danger',
  },
  PUBLISHED: {
    text: 'Objavljen',
    className: 'border-ok/40 bg-ok-soft text-ok',
    dot: 'bg-ok',
  },
  EXPIRED: {
    text: 'Istekao',
    className: 'border-hairline-strong text-faint',
    dot: 'bg-faint',
  },
  SOLD: {
    text: 'Prodano',
    className: 'border-info/40 bg-info-soft text-info',
    dot: 'bg-info',
  },
}

export function StatusBadge({ status }: { status: ListingStatus }) {
  const { text, className, dot } = LABELS[status]

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  )
}
