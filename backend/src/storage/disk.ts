import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { env } from '../env.js'
import { resolveWithinRoot } from './safe-path.js'
import type { StorageAdapter } from './index.js'

/**
 * Development-only storage: writes files under UPLOAD_DIR and lets Express
 * serve them as static files.
 *
 * This must never run in production — container filesystems are wiped on every
 * deploy, so uploads would silently vanish. env.ts refuses to start the
 * process if it would (see ARCHITECTURE.md §6.2).
 */
export class DiskStorage implements StorageAdapter {
  readonly name = 'disk'

  constructor(private readonly root: string = env.UPLOAD_DIR) {}

  private pathFor(key: string): string {
    return resolveWithinRoot(this.root, key)
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key))
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
  }

  urlFor(key: string): string {
    return `${env.PUBLIC_UPLOAD_BASE_URL.replace(/\/$/, '')}/${key}`
  }
}
