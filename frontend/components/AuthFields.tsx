/**
 * Small presentational pieces shared by the sign-in and sign-up forms.
 * Kept separate so both forms look identical without either one owning the
 * styling of the other.
 */

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string | undefined
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error && (
        // role="alert" makes a screen reader announce the message when it
        // appears, instead of leaving it silently on screen.
        <span role="alert" className="mt-1 block text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  )
}

export const inputClass =
  'mt-1 w-full rounded-md border border-hairline-strong bg-transparent px-3 py-2 ' +
  'text-sm outline-none focus:border-black/40 dark:focus:border-white/50'

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
    >
      {message}
    </p>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Trenutak…' : children}
    </button>
  )
}
