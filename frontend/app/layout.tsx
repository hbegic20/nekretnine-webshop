import type { Metadata } from 'next'
import { Archivo, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { siteUrl } from '@/lib/site'

/*
 * Archivo for the interface, Source Serif for figures.
 *
 * The pairing is doing a job rather than decorating: prices set in a serif read
 * as numbers on a page rather than as more interface, which is the one thing a
 * buyer is scanning for. Archivo is a sturdy grotesque that holds up at the
 * small sizes a dense card grid needs.
 *
 * `latin-ext` is not optional here. Without it č, ć, š, ž and đ fall back to
 * whatever the system offers, and the substitution shows up mid-word in
 * "Gornji Vakuf-Uskoplje" and "Sačuvano". The previous fonts were loaded with
 * `latin` alone.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Nekretnine — oglasi za nekretnine',
    template: '%s · Nekretnine',
  },
  description:
    'Oglasi za prodaju i najam nekretnina u Bugojnu, Gornjem Vakufu-Uskoplju, Donjem Vakufu, Jajcu, Kupresu, Travniku i Novom Travniku.',
  // Same value the sitemap and robots.txt are built from, so the three cannot
  // disagree about what this site's address is.
  metadataBase: new URL(siteUrl),
}

/*
 * Applies the saved theme before the first paint.
 *
 * Without this, a visitor who chose dark gets a white flash on every
 * navigation: React only attaches after hydration, by which point the browser
 * has already painted the default. Inline and synchronous is the whole point —
 * it must run before the body renders.
 *
 * Wrapped in try/catch because localStorage throws outright in some privacy
 * modes, and a theme preference is not worth a blank page.
 */
const themeScript = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`

// Typed explicitly rather than with Next's generated `LayoutProps<'/'>` helper.
// That helper lives in .next/types, which only exists after a build has run —
// so using it makes `npm run typecheck` fail on a clean checkout, which is
// exactly the situation CI is in on every pull request.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang="bs" matters for more than correctness: it tells screen readers which
  // pronunciation rules to use, and search engines which market this is for.
  return (
    <html
      lang="bs"
      className={`${archivo.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        {children}
      </body>
    </html>
  )
}
