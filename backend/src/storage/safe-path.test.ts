import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveWithinRoot } from './safe-path.js'

describe('resolveWithinRoot', () => {
  const root = '/srv/uploads'

  it('resolves a normal key inside the root', () => {
    expect(resolveWithinRoot(root, 'listings/abc/photo.webp')).toBe(
      resolve('/srv/uploads/listings/abc/photo.webp'),
    )
  })

  it('rejects a key that climbs out with ..', () => {
    expect(() => resolveWithinRoot(root, '../../etc/passwd')).toThrow(/outside the storage root/)
  })

  it('rejects a climb hidden in the middle of a key', () => {
    expect(() => resolveWithinRoot(root, 'listings/../../secrets.txt')).toThrow(
      /outside the storage root/,
    )
  })

  it('rejects an absolute key, which would ignore the root entirely', () => {
    expect(() => resolveWithinRoot(root, '/etc/passwd')).toThrow(/outside the storage root/)
  })

  it('does not treat a sibling directory with the same prefix as inside the root', () => {
    // /srv/uploads-evil starts with /srv/uploads as a string, but is not
    // inside it. Comparing against root + separator is what catches this.
    expect(() => resolveWithinRoot(root, '../uploads-evil/x.webp')).toThrow(
      /outside the storage root/,
    )
  })
})
