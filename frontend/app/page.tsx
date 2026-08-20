import { TOWNS } from 'shared'
import { serverFetch } from '@/lib/api'

/**
 * Phase 3 placeholder. This is not the real home page — it exists to prove the
 * scaffold is wired together end to end:
 *
 *   1. a Server Component reaches the API                    (Next.js → Express)
 *   2. the API reaches Postgres                              (Express → pg)
 *   3. both apps import the same constants from /shared      (workspace wiring)
 *
 * If all three render, the plumbing works. Phase 4 replaces this with search.
 */
type Readiness = { status: string; database: string }

async function checkApi(): Promise<Readiness | { status: 'unreachable'; database: 'unknown' }> {
  try {
    return await serverFetch<Readiness>('/health/ready')
  } catch {
    return { status: 'unreachable', database: 'unknown' }
  }
}

export default async function HomePage() {
  const health = await checkApi()
  const healthy = health.status === 'ready'

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Nekretnine</h1>
      <p className="mt-2 text-sm opacity-70">
        Scaffold is up. Phase 4 builds auth, listings and search on top of this.
      </p>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-widest opacity-60">Stack check</h2>
        <dl className="mt-3 divide-y divide-black/10 dark:divide-white/10 rounded-lg border border-black/10 dark:border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm">Frontend</dt>
            <dd className="text-sm font-medium text-green-600 dark:text-green-400">rendering</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm">API</dt>
            <dd
              className={`text-sm font-medium ${healthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {health.status}
            </dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm">Database</dt>
            <dd
              className={`text-sm font-medium ${health.database === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {health.database}
            </dd>
          </div>
        </dl>
        {!healthy && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            API unreachable. Start Postgres with <code>npm run db:up</code> and the API with{' '}
            <code>npm run dev:backend</code>.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-widest opacity-60">
          Coverage — {TOWNS.length} towns
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {TOWNS.map((town) => (
            <li
              key={town.slug}
              className="rounded-full border border-black/10 dark:border-white/15 px-3 py-1 text-sm"
            >
              {town.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs opacity-60">
          Imported from <code>/shared</code> — the same array the database enum is built from.
        </p>
      </section>
    </main>
  )
}
