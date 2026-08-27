import argon2 from 'argon2'
import { eq, inArray, sql } from 'drizzle-orm'
import { TOWNS, DEFAULT_EXPIRY_DAYS } from 'shared'
import { db, pool } from './index.js'
import { images, listings, users, type NewListing } from './schema.js'
import { storeListingImage } from '../services/images.js'
import { storage } from '../storage/index.js'
import { placeholderPhoto } from './seed-images.js'
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


/*
 * ---------------------------------------------------------------------------
 * The rest of the market
 * ---------------------------------------------------------------------------
 * The ten hand-written samples above are realistic but too few to show what
 * the site does: at 24 listings per page nothing paginates, a four-column grid
 * never fills, and every admin tab except two is empty. These fill it out.
 *
 * Generated from a fixed seed rather than at random. The same reasoning as the
 * photographs: a re-seed that reshuffles every price and town makes it
 * impossible to tell a code change from a data change.
 */

function rng(seed: number): () => number {
  let state = seed + 0x6d2b79f5
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Illustrative, not a gazetteer — enough variety for search to chew on. */
const NEIGHBOURHOODS = ['Centar', 'Vrbanja', 'Kalibunar', 'Stari grad', 'Podgaj', 'Nova Bila', null]

const ROOM_WORDS = ['Garsonjera', 'Jednosoban stan', 'Dvosoban stan', 'Trosoban stan', 'Četverosoban stan']

const DESCRIPTIONS = [
  'Stan je useljiv odmah, sa centralnim grijanjem i balkonom. U blizini su škola, vrtić i pijaca.',
  'Nekretnina je renovirana prije dvije godine — nova stolarija, kupatilo i podovi. Mirna ulica.',
  'Prostrana nekretnina sa pogledom na rijeku. Parking mjesto uz objekat, podrum i ostava.',
  'Potrebno je manje ulaganje, cijena je u skladu s tim. Papiri uredni, 1/1, odmah useljivo.',
  'Sunčana strana, treći sprat, lift. Blizu autobuske stanice i ambulante.',
]

interface Generated {
  listing: Partial<NewListing> & { title: string }
  photos: number
}

function generateListings(count: number): Generated[] {
  const out: Generated[] = []

  for (let i = 0; i < count; i += 1) {
    const random = rng(i * 977)
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!

    const town = pick(TOWNS)
    const propertyType = pick(['apartment', 'apartment', 'apartment', 'house', 'house', 'land', 'commercial', 'garage'] as const)
    // Rent is the minority here, as it is in this market.
    const transactionType = random() < 0.25 ? ('rent' as const) : ('sale' as const)
    const rooms = 1 + Math.floor(random() * 5)

    const sizeM2 =
      propertyType === 'land'
        ? 400 + Math.floor(random() * 2000)
        : propertyType === 'garage'
          ? 12 + Math.floor(random() * 10)
          : propertyType === 'house'
            ? 90 + Math.floor(random() * 140)
            : 32 + Math.floor(random() * 80)

    const price =
      transactionType === 'rent'
        ? 250 + Math.floor(random() * 900)
        : propertyType === 'land'
          ? 18_000 + Math.floor(random() * 60_000)
          : propertyType === 'garage'
            ? 8_000 + Math.floor(random() * 9_000)
            : Math.round((35_000 + random() * 260_000) / 500) * 500

    const title =
      propertyType === 'apartment'
        ? `${ROOM_WORDS[Math.min(rooms, ROOM_WORDS.length - 1)]!}, ${town.label}, ${sizeM2} m²`
        : propertyType === 'house'
          ? `Kuća sa dvorištem, ${town.label}, ${sizeM2} m²`
          : propertyType === 'land'
            ? `Građevinsko zemljište ${sizeM2} m², ${town.label}`
            : propertyType === 'commercial'
              ? `Poslovni prostor u centru, ${town.label}`
              : `Garaža, ${town.label}`

    out.push({
      listing: {
        title,
        description: pick(DESCRIPTIONS),
        price,
        propertyType,
        transactionType,
        town: town.slug,
        neighbourhood: pick(NEIGHBOURHOODS),
        sizeM2,
        ...(propertyType === 'land' || propertyType === 'garage'
          ? {}
          : {
              rooms,
              bedrooms: Math.max(1, rooms - 1),
              bathrooms: 1 + (random() < 0.3 ? 1 : 0),
              floor: propertyType === 'house' ? null : Math.floor(random() * 6),
              yearBuilt: 1970 + Math.floor(random() * 55),
            }),
        lat: town.lat + (random() - 0.5) * 0.02,
        lng: town.lng + (random() - 0.5) * 0.02,
      },
      // Between one and three. Plenty of real sellers upload exactly one, and
      // a grid where every card has the same gallery depth is a grid that
      // hides what a thin listing looks like.
      photos: 1 + Math.floor(random() * 3),
    })
  }

  return out
}

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

const DAY = 86_400_000

/**
 * How many of each status the seeded market ends up with.
 *
 * Every admin tab having something in it is the point: a queue you cannot see
 * working is a queue you cannot develop against. The counts are deliberate
 * rather than proportional — one rejected listing is enough to show the tab,
 * and thirty published ones is enough to paginate at 24 per page.
 */
const EXTRA_LISTINGS = 28

async function main(): Promise<void> {
  const adminId = await upsertUser('admin@nekretnine.test', 'Admin', true)
  const sellerId = await upsertUser('prodavac@nekretnine.test', 'Amir Prodavac', false)
  const secondSellerId = await upsertUser('agencija@nekretnine.test', 'Agencija Dom', false)
  const owners = [sellerId, secondSellerId]

  /*
   * Start clean so re-running does not pile up duplicates.
   *
   * The image files have to go first, and by hand. Deleting a listing cascades
   * its `images` rows away, but nothing in the database knows about the files
   * on disk — so without this every re-seed would leave another pile of
   * orphaned photos in the uploads directory, belonging to nothing.
   */
  const doomed = await db
    .select({ id: listings.id })
    .from(listings)
    .where(inArray(listings.ownerId, owners))

  if (doomed.length > 0) {
    const oldImages = await db
      .select({ storageKey: images.storageKey, midKey: images.midKey, thumbKey: images.thumbKey })
      .from(images)
      .where(inArray(images.listingId, doomed.map((row) => row.id)))

    await Promise.all(
      oldImages.flatMap((image) =>
        [image.storageKey, image.midKey, image.thumbKey]
          .filter((key): key is string => key !== null)
          .map((key) => storage.delete(key).catch(() => undefined)),
      ),
    )
  }

  const removed = await db
    .delete(listings)
    .where(inArray(listings.ownerId, owners))
    .returning({ id: listings.id })

  const now = new Date()

  /*
   * Statuses, assigned by position rather than at random so the mix is exactly
   * known: the tail carries one of each of the states that are otherwise hard
   * to reach, and everything before it is live.
   */
  const specials: Array<{ status: NewListing['status']; sold?: boolean; expired?: boolean }> = [
    { status: 'PENDING' },
    { status: 'PENDING' },
    { status: 'DRAFT' },
    { status: 'DRAFT' },
    { status: 'REJECTED' },
    { status: 'SOLD', sold: true },
    { status: 'SOLD', sold: true },
    { status: 'EXPIRED', expired: true },
  ]

  const generated = generateListings(EXTRA_LISTINGS)

  const specs = [
    ...SAMPLES.map((sample) => ({ listing: sample, photos: 3 })),
    ...generated,
  ]

  const rows: NewListing[] = specs.map((spec, index) => {
    const town = TOWNS.find((t) => t.slug === (spec.listing.town ?? 'bugojno'))!
    const fromEnd = specs.length - index - 1
    const special = fromEnd < specials.length ? specials[specials.length - 1 - fromEnd] : undefined
    const status = special?.status ?? 'PUBLISHED'
    const live = status === 'PUBLISHED' || status === 'SOLD' || status === 'EXPIRED'

    /*
     * Publication dates fan out over two months so "newest" has something to
     * sort and the 48-hour "Novo" badge appears on a couple of cards rather
     * than on all of them or none.
     */
    const publishedAt = live ? new Date(now.getTime() - (index % 60) * DAY) : null

    return {
      ownerId: index % 3 === 0 ? secondSellerId : sellerId,
      description:
        'Primjer oglasa za razvoj. Nekretnina je u dobrom stanju, blizu škole i prodavnice. ' +
        'Kontaktirajte nas za dogovor oko obilaska.',
      contactName: index % 3 === 0 ? 'Agencija Dom' : 'Amir Prodavac',
      contactPhone: '061 000 000',
      contactEmail: index % 3 === 0 ? 'agencija@nekretnine.test' : 'prodavac@nekretnine.test',
      // Pins are scattered around each town centre rather than stacked on one
      // point, and scattered the same way on every seed.
      lat: town.lat,
      lng: town.lng,
      status,
      publishedAt,
      expiresAt: special?.expired
        ? new Date(now.getTime() - 2 * DAY)
        : live
          ? new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * DAY)
          : null,
      soldAt: special?.sold ? new Date(now.getTime() - 3 * DAY) : null,
      rejectionReason:
        status === 'REJECTED' ? 'Slike ne prikazuju nekretninu. Dodajte fotografije stana.' : null,
      /*
       * Two featured listings, no more. The whole value of paid placement is
       * that most listings do not have it, and a seed that features a third of
       * the market would teach exactly the wrong lesson about how the grid
       * looks.
       */
      featuredUntil: status === 'PUBLISHED' && (index === 1 || index === 12)
        ? new Date(now.getTime() + 14 * DAY)
        : null,
      ...spec.listing,
    } as NewListing
  })

  const inserted = await db.insert(listings).values(rows).returning({ id: listings.id })

  /*
   * Photos, drawn rather than downloaded (see seed-images.ts).
   *
   * Sequential rather than Promise.all: each one rasterises an SVG and encodes
   * three WebPs, and firing eighty of those at once makes sharp fight itself
   * for threads on a laptop that is also running two dev servers. It is the
   * slow part of seeding — around ten seconds — and it only runs on an empty
   * database.
   */
  let photos = 0
  for (const [index, row] of inserted.entries()) {
    const spec = specs[index]!
    const type = rows[index]?.propertyType ?? 'apartment'

    for (let position = 0; position < spec.photos; position += 1) {
      await storeListingImage({
        listingId: row.id,
        body: await placeholderPhoto(type, index * 10 + position),
        position,
        isCover: position === 0,
      })
      photos += 1
    }
  }

  log.info('seed complete', {
    photos,
    removedOldListings: removed.length,
    listings: inserted.length,
    adminId,
  })
  console.log(`\n  admin:     admin@nekretnine.test / ${SEED_PASSWORD}`)
  console.log(`  prodavac:  prodavac@nekretnine.test / ${SEED_PASSWORD}`)
  console.log(`  agencija:  agencija@nekretnine.test / ${SEED_PASSWORD}\n`)

  await pool.end()
}

main().catch((error: unknown) => {
  log.error('seed failed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
