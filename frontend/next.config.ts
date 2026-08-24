import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * NOTE: this is read at BUILD time, not at run time.
 *
 * `rewrites()` is evaluated by `next build` and the resolved destination is
 * baked into routes-manifest.json, so setting BACKEND_URL when the container
 * starts has no effect — it has to be set when the image is built. The
 * Dockerfile passes it as a build argument for exactly this reason.
 *
 * This is the single most confusing thing about deploying a Next.js app, and
 * it is the sort of difference that produces "works locally, 404s in
 * production". If we ever need one image that can point at different backends
 * per environment, the rewrite has to become a Route Handler that reads
 * process.env at request time.
 */
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000'

const nextConfig: NextConfig = {
  /**
   * Produces .next/standalone: a self-contained server plus only the
   * node_modules actually reachable from the code, traced by Next. It is what
   * keeps the runtime image small — the alternative is shipping the entire
   * dependency tree, most of which is build tooling.
   */
  output: 'standalone',

  /**
   * In a monorepo, tracing has to start at the workspace root or Next will
   * miss files outside /frontend — including everything imported from
   * /shared, which would then be absent at runtime.
   */
  outputFileTracingRoot: path.join(process.cwd(), '..'),

  /**
   * The single highest-leverage line in this project.
   *
   * Without it the browser would call the API on a different origin
   * (localhost:4000 vs localhost:3000), and because cookies are bound to an
   * origin we would need CORS with credentials, an origin allowlist,
   * SameSite=None, and a shared parent domain in production.
   *
   * With it, the browser only ever talks to this site. Next.js forwards
   * /api/* to the API server-side, the session cookie is first-party, and the
   * API never has to be publicly reachable at all.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
