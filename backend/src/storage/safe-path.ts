import { isAbsolute, join, resolve, sep } from 'node:path'

/**
 * Resolve a storage key inside a root directory, refusing anything that
 * escapes it.
 *
 * This is the classic path traversal guard. A key of `../../etc/passwd` would
 * otherwise resolve outside the upload directory and let a caller write
 * wherever the process has permission to.
 *
 * Today every key is generated server-side from a uuid, so nothing hostile can
 * reach here. That is exactly why the check belongs in code rather than in our
 * heads: the guarantee holds until someone adds a route that takes a filename
 * from a request, and that person should not have to know this rule.
 *
 * It lives in its own file, free of any imports from env or the database, so
 * it can be unit-tested without booting the application.
 */
export function resolveWithinRoot(root: string, key: string): string {
  // An absolute key is rejected rather than quietly re-rooted. `join()` would
  // turn "/etc/passwd" into "<root>/etc/passwd", which is safe but hides the
  // fact that the caller passed something it should not have. Failing loudly
  // surfaces the bug instead of writing a file to a surprising place.
  if (isAbsolute(key)) {
    throw new Error(`refusing to resolve a path outside the storage root: ${key}`)
  }

  const absoluteRoot = resolve(root)
  const target = resolve(join(absoluteRoot, key))

  if (target !== absoluteRoot && !target.startsWith(absoluteRoot + sep)) {
    throw new Error(`refusing to resolve a path outside the storage root: ${key}`)
  }

  return target
}
