import argon2 from 'argon2'
import { eq, sql } from 'drizzle-orm'
import { TOWNS, DEFAULT_EXPIRY_DAYS } from 'shared'
import { db, pool } from './index.js'
import { listings, users, type NewListing } from './schema.js'
import { env } from '../env.js'
import { log } from '../log.js'

/**
 * Development seed data.
 *
 * Every later phase — search, filters, the map — needs published listings to
 * work against, and nothing can reach PUBLISHED without an admin. Rather than
 * click through the moderation queue by hand every time the database is reset,
 * this creates the accounts and a spread of listings directly.
 *
 * Refuses to run in production. A seed script that can be pointed at a live
 * database is a loaded gun: this one would reset the password of a real
 * administrator account.
 */
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.')
  process.exit(1)
}

const SEED_PASSWORD = 'lozinka123'

const SAMPLES: Array<Partial<NewListing> & { title: string }> = [
  { title: 'Trosoban stan u centru Bugojna, 78 m²', town: 'bugojno', price: 145_000, propertyType: 'apartment', transactionType: 'sale', sizeM2: 78, rooms: 3, bedrooms: 2, bathrooms: 1, floor: 3, yearBuilt: 2005, neighbourhood: 'Centar' },
  { title: 'Kuća sa okućnicom, Gornji Vakuf-Uskoplje', town: 'gornji-vakuf-uskoplje', price: 210_000, propertyType: 'house', transactionType: 'sale', sizeM2: 180, rooms: 5, bedrooms: 4, bathrooms: 2, yearBuilt: 1998 },
  { title: 'Građevinsko zemljište 1200 m², Donji Vakuf', town: 'donji-vakuf', price: 38_000, propertyType: 'land', transactionType: 'sale', sizeM2: 1200 },
  { title: 'Dvosoban stan blizu vodopada, Jajce', town: 'jajce', price: 600, propertyType: 'apartment', transactionType: 'rent', sizeM2: 54, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 1, yearBuilt: 2012, neighbourhood: 'Stari grad' },
  { title: 'Apartman na Kupresu, blizu skijališta', town: 'kupres', price: 98_000, propertyType: 'apartment', transactionType: 'sale', sizeM2: 42, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 2, yearBuilt: 2019 },
  { title: 'Poslovni prostor u centru Travnika, 65 m²', town: 'travnik', price: 1_100, propertyType: 'commercial', transactionType: 'rent', sizeM2: 65, floor: 0, yearBuilt: 2001 },
  { title: 'Četverosoban stan, Novi Travnik', town: 'novi-travnik', price: 132_000, propertyType: 'apartment', transactionType: 'sale', sizeM2: 92, rooms: 4, bedrooms: 3, bathrooms: 2, floor: 5, yearBuilt: 1988 },
  { title: 'Garaža u naselju Vrbanja, Bugojno', town: 'bugojno', price: 12_500, propertyType: 'garage', transactionType: 'sale', sizeM2: 16 },
  { title: 'Vikendica na Vranici, Gornji Vakuf-Uskoplje', town: 'gornji-vakuf-uskoplje', price: 76_000, propertyType: 'house', transactionType: 'sale', sizeM2: 68, rooms: 3, bedrooms: 2, bathrooms: 1, yearBuilt: 2008 },
  { title: 'Stan za najam, blizu bolnice, Travnik', town: 'travnik', price: 450, propertyType: 'apartment', transactionType: 'rent', sizeM2: 61, rooms: 2, bedrooms: 1, bathrooms: 1, floor: 4, yearBuilt: 1979 },
]

async function upsertUser(email: string, name: string, isAdmin: boolean): Promise<string> {
  const passwordHash = await argon2.hash(SEED_PASSWORD)

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (existing[0]) {
    await db.update(users).set({ passwordHash, isAdmin, isSeller: true }).where(eq(users.id, existing[0].id))
    return existing[0].id
  }

  const inserted = await db
    .insert(users)
    .values({ email, passwordHash, name, isAdmin, isSeller: true, phone: '061 000 000' })
    .returning({ id: users.id })

  const id = inserted[0]?.id
  if (!id) throw new Error('failed to create seed user')
  return id
}

async function main(): Promise<void> {
  const adminId = await upsertUser('admin@nekretnine.test', 'Admin', true)
  const sellerId = await upsertUser('prodavac@nekretnine.test', 'Amir Prodavac', false)

  // Start clean so re-running does not pile up duplicates.
  const removed = await db.delete(listings).where(eq(listings.ownerId, sellerId)).returning({ id: listings.id })

  const now = new Date()
  const rows: NewListing[] = SAMPLES.map((sample, index) => {
    const town = TOWNS.find((t) => t.slug === sample.town)!
    // Scatter pins around each town centre so the map has something to show
    // rather than ten markers stacked on one point.
    const jitter = () => (Math.random() - 0.5) * 0.02

    return {
      ownerId: sellerId,
      description:
        'Primjer oglasa za razvoj. Nekretnina je u dobrom stanju, blizu škole i prodavnice. ' +
        'Kontaktirajte nas za dogovor oko obilaska.',
      contactName: 'Amir Prodavac',
      contactPhone: '061 000 000',
      contactEmail: 'prodavac@nekretnine.test',
      lat: town.lat + jitter(),
      lng: town.lng + jitter(),
      // Most are live; the last two exercise the rest of the lifecycle so the
      // seller dashboard is not a wall of identical green badges.
      status: index < SAMPLES.length - 2 ? 'PUBLISHED' : index === SAMPLES.length - 2 ? 'PENDING' : 'DRAFT',
      publishedAt: index < SAMPLES.length - 2 ? new Date(now.getTime() - index * 86_400_000) : null,
      expiresAt:
        index < SAMPLES.length - 2
          ? new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000)
          : null,
      ...sample,
    } as NewListing
  })

  const inserted = await db.insert(listings).values(rows).returning({ id: listings.id })

  log.info('seed complete', {
    removedOldListings: removed.length,
    listings: inserted.length,
    adminId,
    sellerId,
  })
  console.log(`\n  admin:     admin@nekretnine.test / ${SEED_PASSWORD}`)
  console.log(`  prodavac:  prodavac@nekretnine.test / ${SEED_PASSWORD}\n`)

  await pool.end()
}

main().catch((error: unknown) => {
  log.error('seed failed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
