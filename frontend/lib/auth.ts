import { cookies } from 'next/headers'
import type { PublicUser } from 'shared'
import { apiUrl } from './api'

/**
 * Who is signed in, as seen from a Server Component.
 *
 * The subtle part — and the thing that catches everyone once — is the cookie
 * header. In the browser, `fetch` automatically attaches cookies for the
 * origin. On the server there is no cookie jar and no browser: this code is
 * making a fresh outbound HTTP call to the API, and unless we explicitly copy
 * the cookies from the incoming request onto it, the API sees an anonymous
 * request and every page renders signed-out.
 *
 * `cookies()` is async in the App Router, hence the await.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(apiUrl('/api/auth/me'), {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })

    // 401 is the normal signed-out answer, not a failure worth surfacing.
    if (!response.ok) return null

    const body = (await response.json()) as { user: PublicUser }
    return body.user
  } catch {
    // API down — render the page signed-out rather than crashing it.
    return null
  }
}
