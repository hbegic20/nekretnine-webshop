import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * What crawlers may look at.
 *
 * Browsing is deliberately open to anonymous visitors (SPEC.md §2), so the
 * listings themselves are wide open — that is the entire point of the site.
 * What is disallowed is everything that is either private or pointless in a
 * search result.
 *
 * Worth being clear about what this is not: robots.txt is a request, not a
 * security control. Anything genuinely private is protected by the API
 * returning 404 to people who may not see it, and this file only keeps
 * well-behaved crawlers from wasting their time and ours.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Private: someone else's dashboard is not content.
        '/admin',
        '/moji-oglasi',
        '/sacuvano',
        // Useless in results, and a crawler indexing a login form is a small
        // ongoing embarrassment in Search Console.
        '/login',
        '/register',
        // The API answers JSON. Crawling it costs us requests and gains
        // nobody anything — and on a free instance those requests are the
        // thing that keeps it awake.
        '/api/',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
