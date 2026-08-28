import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Copies MapLibre's worker into public/ so the browser can actually fetch it.
 *
 * MapLibre parses vector tiles in a Web Worker, and it works out where that
 * worker lives at *runtime*, from `import.meta.url` of its own bundle — then
 * asks for a sibling file next to it. Under Next that resolves to something
 * like /_next/static/chunks/maplibre-gl-worker.mjs, which Next never emits, so
 * the request falls through to the router and comes back as the HTML 404 page.
 * The browser then refuses it: "Failed to load module script … non-JavaScript
 * MIME type".
 *
 * No bundler can fix that on its own — the URL is assembled from a string at
 * runtime, so there is nothing to statically analyse. MapLibre's own answer is
 * `setWorkerUrl()`, which needs the file at a stable address; this puts it
 * there.
 *
 * What made it hard to spot: a missing worker does not look like a missing
 * file. Markers, zoom controls and attribution are plain DOM and keep working
 * perfectly, while the basemap — the only part that needs tiles parsed — stays
 * empty. The symptom is a black rectangle that looks like a styling problem.
 *
 * Copied on every dev and build rather than committed, so it cannot drift from
 * the installed version of the package.
 */

const require = createRequire(import.meta.url)
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'))
const target = join(import.meta.dirname, '..', 'public', 'maplibre')

// The worker imports ./maplibre-gl-shared.mjs relative to itself, so the pair
// has to travel together — the worker alone fails the same way, one level
// further in.
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

await mkdir(target, { recursive: true })
await Promise.all(files.map((file) => copyFile(join(dist, file), join(target, file))))

console.log(`maplibre worker → public/maplibre/ (${files.join(', ')})`)
