import type { NextConfig } from 'next'

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000'

const nextConfig: NextConfig = {
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
