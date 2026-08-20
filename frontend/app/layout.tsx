import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Nekretnine — oglasi za nekretnine',
    template: '%s · Nekretnine',
  },
  description:
    'Oglasi za prodaju i najam nekretnina u Bugojnu, Gornjem Vakufu-Uskoplju, Donjem Vakufu, Jajcu, Kupresu, Travniku i Novom Travniku.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
}

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        {children}
      </body>
    </html>
  )
}
