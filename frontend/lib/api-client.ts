/**
 * Browser-side API helpers.
 *
 * These call relative paths on purpose. `/api/auth/login` goes to the Next.js
 * origin, which rewrites it to the API server-side (next.config.ts). The
 * request is therefore same-origin: the browser sends the session cookie
 * without being asked, and `Set-Cookie` on the way back is first-party.
 *
 * Calling the API's real address from the browser instead would reintroduce
 * every cross-origin cookie problem the proxy exists to remove.
 */

export interface ApiFieldError {
  path: string
  message: string
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    fields?: ApiFieldError[]
  }
}

export interface ApiFailure {
  message: string
  fields: Record<string, string>
}

/** Turns any error response into something a form can display. */
export async function readApiError(response: Response): Promise<ApiFailure> {
  let body: ApiErrorBody = {}
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    // not JSON — fall through to the generic message
  }

  const fields: Record<string, string> = {}
  for (const field of body.error?.fields ?? []) {
    // Keep the first message per field; later ones are usually redundant.
    fields[field.path] ??= field.message
  }

  return {
    message: body.error?.message ?? `Greška (${response.status}). Pokušajte ponovo.`,
    fields,
  }
}
