/**
 * Talking to the API from the two places Next.js runs code.
 *
 * This distinction trips everyone up once, so it is worth being explicit:
 *
 *   - In the BROWSER, call a relative path like `/api/listings`. The Next.js
 *     rewrite in next.config.ts forwards it to the API server-side, so the
 *     request is same-origin and the session cookie is sent automatically.
 *
 *   - On the SERVER (Server Components, route handlers), there is no browser
 *     and no relative URL to resolve, and the rewrite does not apply — it only
 *     rewrites requests that arrive at Next.js from outside. Server code must
 *     call the API's real address directly.
 *
 * Hence two helpers rather than one.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000'

/** Server-side only: absolute URL straight to the API. */
export function apiUrl(path: string): string {
  return `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Fetch from a Server Component.
 *
 * `cache: 'no-store'` by default because listing data changes when an admin
 * approves something, and a stale cached page would show the wrong thing.
 * Individual calls can opt into caching once we know which pages are safe to
 * cache — that tuning belongs in Phase 4, not here.
 */
export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { cache: 'no-store', ...init })

  if (!response.ok) {
    let message = `Request failed with ${response.status}`
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // response was not JSON — keep the generic message
    }
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}
