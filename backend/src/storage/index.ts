import { env } from '../env.js'
import { log } from '../log.js'
import { DiskStorage } from './disk.js'
import { S3Storage } from './s3.js'

/**
 * Storage lives behind this interface so that the difference between "files on
 * my laptop" and "files in Cloudflare R2" is confined to two small classes.
 *
 * This is the ports-and-adapters idea, and it is worth recognising because it
 * recurs everywhere: isolate the thing that varies behind an interface, so the
 * variation lives in exactly one place. Nothing above this line — no route, no
 * service, no React component — knows which implementation is running.
 *
 * A `key` is a path *inside* the store, like `listings/<id>/<uuid>.webp`.
 * Never store a full URL in the database: bake in `localhost:4000` today and
 * every one of those rows breaks the day images move to R2.
 */
export interface StorageAdapter {
  readonly name: string
  put(key: string, body: Buffer, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  /** The public URL a browser should use for this key. */
  urlFor(key: string): string
}

export function createStorage(): StorageAdapter {
  const storage = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new DiskStorage()
  log.info('storage adapter ready', { driver: storage.name })
  return storage
}

export const storage = createStorage()
