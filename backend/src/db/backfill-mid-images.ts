import { isNull } from 'drizzle-orm'
import sharp from 'sharp'
import { db, pool } from './index.js'
import { images } from './schema.js'
import { storage } from '../storage/index.js'
import { log } from '../log.js'
import { eq } from 'drizzle-orm'

/**
 * Generates the mid-size rendition for images uploaded before it existed.
 *
 * Run once after migration 0003, against whichever environment holds the
 * files: `npm run images:backfill`. Safe to run repeatedly — it only looks at
 * rows where `mid_key` is still null, so an interrupted run resumes where it
 * stopped.
 *
 * The source is the stored 1600px image rather than the original upload, which
 * we never keep. Downscaling an already-downscaled WebP loses a little
 * quality in theory; at these sizes it is not visible, and keeping every
 * original around for a hypothetical re-encode would multiply the storage bill
 * for nothing.
 */
const MID_EDGE = 1000

async function main(): Promise<void> {
  const pending = await db
    .select({ id: images.id, storageKey: images.storageKey })
    .from(images)
    .where(isNull(images.midKey))

  if (pending.length === 0) {
    log.info('mid backfill: nothing to do')
    await pool.end()
    return
  }

  log.info('mid backfill starting', { count: pending.length, driver: storage.name })

  let done = 0
  let failed = 0

  for (const row of pending) {
    try {
      const original = await storage.get(row.storageKey)
      const mid = await sharp(original)
        .resize({ width: MID_EDGE, height: MID_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()

      // Same naming rule as the upload path, so a key is predictable from the
      // large one and nothing has to store the relationship.
      const midKey = `${row.storageKey.replace(/\.webp$/, '')}-mid.webp`
      await storage.put(midKey, mid, 'image/webp')

      // The row is updated only after the file is safely written. The other
      // order would leave a row pointing at a file that does not exist, which
      // renders as a broken image on a live page.
      await db.update(images).set({ midKey }).where(eq(images.id, row.id))
      done += 1
    } catch (error) {
      // One unreadable file should not stop the run. It stays null, keeps
      // serving the full-size image, and the next run tries again.
      failed += 1
      log.warn('mid backfill failed for one image', {
        imageId: row.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  log.info('mid backfill complete', { done, failed })
  await pool.end()
}

main().catch((error: unknown) => {
  log.error('mid backfill failed', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
