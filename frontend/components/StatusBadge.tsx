import type { ListingStatus } from 'shared'

/**
 * Colour is not the only signal here — each status also has distinct text.
 * Roughly one man in twelve has some form of colour blindness, and a badge
 * that is only distinguishable by hue is invisible to them.
 */
const LABELS: Record<ListingStatus, { text: string; className: string }> = {
  DRAFT: { text: 'Nacrt', className: 'border-black/20 dark:border-white/25 opacity-70' },
  PENDING: { text: 'Čeka odobrenje', className: 'border-amber-500/40 text-amber-700 dark:text-amber-400' },
  REJECTED: { text: 'Odbijen', className: 'border-red-500/40 text-red-700 dark:text-red-400' },
  PUBLISHED: { text: 'Objavljen', className: 'border-green-600/40 text-green-700 dark:text-green-400' },
  EXPIRED: { text: 'Istekao', className: 'border-black/20 dark:border-white/25 opacity-60' },
  SOLD: { text: 'Prodano', className: 'border-blue-500/40 text-blue-700 dark:text-blue-400' },
}

export function StatusBadge({ status }: { status: ListingStatus }) {
  const { text, className } = LABELS[status]
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${className}`}>
      {text}
    </span>
  )
}
