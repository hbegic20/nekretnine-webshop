/**
 * What the search page shows while results are being fetched.
 *
 * Card-shaped rather than a spinner, and that is the whole point: the page
 * keeps its final shape, so when the listings land nothing jumps. A spinner in
 * the middle of an empty page means the layout appears twice — once empty,
 * once full — and the second one shoves the first out of the way.
 *
 * Next renders this automatically for the route segment while its Server
 * Component awaits data.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Učitavanje oglasa…</span>

      <div className="h-8 w-40 animate-pulse rounded-md bg-sunken" />
      <div className="mt-6 h-[104px] animate-pulse rounded-card bg-sunken sm:h-[168px]" />
      <div className="mt-6 h-4 w-28 animate-pulse rounded bg-sunken" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Eight, because that is what fills the first screen of a four-column
            grid — enough to hold the shape, not so many that a fast response
            renders a wall of grey for a moment. */}
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-card border border-hairline bg-surface"
          >
            <div className="aspect-[4/3] animate-pulse bg-sunken" />
            <div className="flex flex-col gap-2 p-3.5">
              <div className="h-5 w-24 animate-pulse rounded bg-sunken" />
              <div className="h-4 w-full animate-pulse rounded bg-sunken" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-sunken" />
              <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-sunken" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
