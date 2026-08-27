/**
 * The site's own public address.
 *
 * Needed wherever a URL has to be absolute rather than relative: the sitemap,
 * robots.txt, and the metadataBase that Open Graph tags are resolved against.
 * Relative URLs are fine inside the page and useless to a crawler or a
 * link preview in a chat app.
 *
 * `NEXT_PUBLIC_` because it is not a secret — it is the address people type.
 * The localhost fallback keeps development working without an env file; in
 * production it is set in the Netlify dashboard, and getting it wrong shows up
 * as a sitemap full of localhost URLs rather than as an error.
 */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
