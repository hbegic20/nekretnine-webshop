import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../app.js'

/**
 * The app, on a real socket, driven with `fetch`.
 *
 * supertest is the conventional choice and was considered. It was declined for
 * two reasons: it is a dependency we do not otherwise need (ARCHITECTURE.md
 * §10 keeps that list short on purpose), and it binds the app internally,
 * which skips the part of the request most likely to be wrong here. We parse
 * the `Cookie` header ourselves rather than using cookie-parser, so the header
 * round-trip is exactly the thing worth exercising.
 *
 * Port 0 means "any free port". A fixed port would collide with `npm run dev`
 * on 4000, which is the kind of failure that only happens on the machine of
 * whoever happens to have the dev server running.
 */

let server: Server | null = null
let baseUrl = ''

export async function startTestServer(): Promise<void> {
  const app = createApp()

  server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, '127.0.0.1', () => {
      resolve(listening)
    })
    listening.once('error', reject)
  })

  const address = server.address() as AddressInfo | null
  if (!address) throw new Error('test server did not bind to a port')
  baseUrl = `http://127.0.0.1:${address.port}`
}

export async function stopTestServer(): Promise<void> {
  const running = server
  if (!running) return
  server = null

  await new Promise<void>((resolve, reject) => {
    running.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export interface ApiResponse<T> {
  status: number
  body: T
  headers: Headers
}

/** The error envelope from http/errors.ts, so failures can be asserted on. */
export interface ApiError {
  error: {
    code: string
    message: string
    fields?: { path: string; message: string }[]
  }
}

/**
 * One client is one browser: it keeps its own cookie jar, so a test can hold a
 * seller, an admin and an anonymous visitor at the same time and they do not
 * tread on each other's sessions.
 */
export class ApiClient {
  private readonly jar = new Map<string, string>()

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'

    const cookie = this.cookieHeader()
    if (cookie) headers.cookie = cookie

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // Cookies are handled by the jar below, not by fetch's own store.
      redirect: 'manual',
    })

    this.storeCookies(response)

    return {
      status: response.status,
      body: (await parseBody(response)) as T,
      headers: response.headers,
    }
  }

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path)
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body)
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body)
  }
  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body)
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path)
  }

  cookieHeader(): string {
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  /**
   * Put an arbitrary value in the jar — used to test a forged session cookie.
   *
   * Encoded on the way in, because the jar holds values exactly as they travel
   * on the wire (Express encodes what it writes, and http/cookies.ts decodes
   * what it reads). Without this, a token containing anything outside ASCII
   * fails inside fetch with a ByteString error rather than reaching the
   * server, which is a confusing way to learn that headers are bytes.
   */
  setCookie(name: string, value: string): void {
    this.jar.set(name, encodeURIComponent(value))
  }

  private storeCookies(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';')
      if (!pair) continue

      const eq = pair.indexOf('=')
      if (eq < 1) continue

      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()

      /*
       * An empty value is a deletion. That is how `res.clearCookie` works —
       * it sends the name with no value and an expiry in 1970 — and a jar that
       * stored it verbatim would keep sending `sid=` after logout, which looks
       * exactly like logout being broken.
       */
      if (value === '') this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }
}

/** A fresh, signed-out client. */
export function api(): ApiClient {
  return new ApiClient()
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') return undefined

  try {
    return JSON.parse(text) as unknown
  } catch {
    // Not JSON — return it raw so the assertion failure shows what came back
    // rather than a parse error.
    return text
  }
}
