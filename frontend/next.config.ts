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

/**
 * Standalone output is for the Docker image, and only for it.
 *
 * It produces .next/standalone: a self-contained server plus only the
 * node_modules actually reachable from the code, traced by Next. That is what
 * keeps the runtime image small — the alternative is shipping the entire
 * dependency tree, most of which is build tooling.
 *
 * Netlify must NOT get it. Netlify builds through its own OpenNext adapter,
 * which splits the app into functions and static assets itself; handing it a
 * standalone server as well means building two deployment shapes and hoping
 * the right one wins. So the Dockerfile sets NEXT_OUTPUT=standalone and
 * nothing else does — `npm run dev`, `npm run build` and Netlify all get the
 * default output.
 *
 * `outputFileTracingRoot` below stays on in both cases: it is what pulls
 * /shared into the traced file list, and Netlify needs that as much as Docker
 * does.
 */
const standalone = process.env.NEXT_OUTPUT === 'standalone'

const nextConfig: NextConfig = {
  ...(standalone ? { output: 'standalone' as const } : {}),

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
