import sharp from 'sharp'
import type { PropertyType } from 'shared'

/**
 * Placeholder photography for the development seed.
 *
 * Drawn rather than downloaded, and that is a deliberate trade. Fetching real
 * photos would mean the seed needs the internet, an external service that can
 * disappear, and a licence question nobody wants to answer for a demo. These
 * are SVG scenes rasterised by sharp — a dependency we already have for
 * thumbnails — so `npm run dev` works on a plane.
 *
 * They are meant to read as obvious placeholders at a glance while still
 * giving the grid what real photos give it: a different colour and shape per
 * card, so the layout can be judged honestly instead of against ten identical
 * grey rectangles.
 */

const WIDTH = 1600
const HEIGHT = 1200

/**
 * Deterministic randomness, seeded per image.
 *
 * The same listing must draw the same picture on every re-seed. Math.random()
 * would reshuffle every card each time the database is reset, which makes it
 * impossible to tell a layout change from a data change.
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

/** Four times of day, so a gallery of one property is not four identical skies. */
const MOODS = [
  { sky: ['#cfe3ee', '#eef4f4'], hill: ['#8ca79f', '#6c8b85'], ground: '#dfe6e0', sun: '#f6f2e6' },
  { sky: ['#f4dfc8', '#fbf1e4'], hill: ['#a08d78', '#7d6d5d'], ground: '#e9e0d2', sun: '#f8e3b8' },
  { sky: ['#b9cfdd', '#e3edf1'], hill: ['#7d97a6', '#5e7683'], ground: '#dce4e7', sun: '#eef4f6' },
  { sky: ['#5c6f86', '#93a7ba'], hill: ['#3f5164', '#2b3a49'], ground: '#4a5c6e', sun: '#f2d9a8' },
] as const

/** A wash of the accent so the placeholders belong to this site's palette. */
const ROOF = ['#0f5c63', '#8a4a34', '#43524f', '#6b4f2a'] as const

/**
 * `groundY` is where the ground band starts, and everything here is positioned
 * against it rather than against absolute coordinates. The horizon moves per
 * image, so hardcoded positions left the fence on the land plots hanging in
 * mid-air like a ladder.
 */
function buildings(type: PropertyType, random: () => number, roof: string, groundY: number): string {
  const jitter = (n: number) => Math.round((random() - 0.5) * n)

  switch (type) {
    case 'house':
      return `
        <path d="M520 ${760 + jitter(30)} L800 ${560 + jitter(40)} L1080 ${760 + jitter(30)} Z" fill="${roof}"/>
        <rect x="580" y="740" width="440" height="300" fill="#f0ece4"/>
        <rect x="640" y="800" width="110" height="110" fill="${roof}" opacity="0.55"/>
        <rect x="850" y="800" width="110" height="110" fill="${roof}" opacity="0.55"/>
        <rect x="760" y="930" width="90" height="110" fill="${roof}" opacity="0.8"/>`

    case 'apartment':
      return `
        <rect x="520" y="${420 + jitter(60)}" width="280" height="620" fill="#e8e4dc"/>
        <rect x="820" y="${520 + jitter(60)}" width="260" height="520" fill="#dcd7ce"/>
        <rect x="500" y="400" width="320" height="34" fill="${roof}"/>
        ${gridOfWindows(548, 470, 4, 6, roof)}
        ${gridOfWindows(852, 570, 3, 5, roof)}`

    case 'commercial':
      return `
        <rect x="440" y="${560 + jitter(40)}" width="720" height="480" fill="#e6e2da"/>
        <rect x="440" y="560" width="720" height="70" fill="${roof}"/>
        <rect x="490" y="680" width="280" height="220" fill="${roof}" opacity="0.35"/>
        <rect x="820" y="680" width="290" height="220" fill="${roof}" opacity="0.35"/>
        <rect x="700" y="900" width="180" height="140" fill="${roof}" opacity="0.7"/>`

    case 'garage':
      return `
        <rect x="600" y="${700 + jitter(30)}" width="420" height="340" fill="#e4e0d8"/>
        <path d="M580 700 L810 610 L1040 700 Z" fill="${roof}"/>
        <rect x="660" y="780" width="300" height="260" fill="${roof}" opacity="0.6"/>
        <rect x="660" y="780" width="300" height="26" fill="#f2efe9" opacity="0.5"/>`

    case 'land':
    default: {
      // No building, obviously — a fenced plot with furrows, so an empty piece
      // of land does not read as a picture that failed to load.
      const postTop = groundY + 30
      const postHeight = 130
      return `
        ${Array.from({ length: 8 }, (_, i) => {
          const x = 380 + i * 116
          return `<rect x="${x}" y="${postTop}" width="12" height="${postHeight}" fill="${roof}" opacity="0.55"/>`
        }).join('')}
        <rect x="380" y="${postTop + 34}" width="828" height="9" fill="${roof}" opacity="0.45"/>
        <rect x="380" y="${postTop + 86}" width="828" height="9" fill="${roof}" opacity="0.45"/>
        ${Array.from({ length: 3 }, (_, i) => {
          const y = postTop + postHeight + 40 + i * 46
          return `<path d="M${240 + jitter(30)} ${y} Q800 ${y - 26} ${1360 + jitter(30)} ${y}" stroke="${roof}" stroke-width="5" fill="none" opacity="0.2"/>`
        }).join('')}`
    }
  }
}

function gridOfWindows(x: number, y: number, cols: number, rows: number, colour: string): string {
  const cells: string[] = []
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      cells.push(
        `<rect x="${x + c * 62}" y="${y + r * 78}" width="40" height="52" fill="${colour}" opacity="0.45"/>`,
      )
    }
  }
  return cells.join('')
}

function scene(type: PropertyType, seed: number): string {
  const random = rng(seed)
  const mood = MOODS[seed % MOODS.length]!
  const roof = ROOF[Math.floor(random() * ROOF.length)]!
  const horizon = 700 + Math.round((random() - 0.5) * 80)

  const ridge = (offset: number, colour: string, height: number) =>
    `<path d="M0 ${horizon + offset} L${260 + random() * 200} ${horizon - height} L${
      600 + random() * 200
    } ${horizon + offset - 40} L${1000 + random() * 240} ${horizon - height * 0.7} L1600 ${
      horizon + offset
    } L1600 1200 L0 1200 Z" fill="${colour}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${mood.sky[0]}"/>
        <stop offset="100%" stop-color="${mood.sky[1]}"/>
      </linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.16"/>
      </linearGradient>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
    <circle cx="${300 + random() * 900}" cy="${180 + random() * 140}" r="${70 + random() * 40}" fill="${mood.sun}" opacity="0.85"/>

    ${ridge(60, mood.hill[0], 300 + random() * 120)}
    ${ridge(0, mood.hill[1], 200 + random() * 100)}

    <rect y="${horizon + 120}" width="${WIDTH}" height="${HEIGHT - horizon - 120}" fill="${mood.ground}"/>
    ${buildings(type, random, roof, horizon + 120)}

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
  </svg>`
}

/**
 * One placeholder photo as JPEG bytes.
 *
 * JPEG rather than WebP because this is standing in for a camera upload, and
 * the pipeline it feeds re-encodes to WebP anyway — going in as JPEG exercises
 * the same conversion a real photo takes.
 */
export function placeholderPhoto(type: PropertyType, seed: number): Promise<Buffer> {
  return sharp(Buffer.from(scene(type, seed))).jpeg({ quality: 86 }).toBuffer()
}
