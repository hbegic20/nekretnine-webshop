# Bugojno Nekretnine

A property listings site for seven towns in central Bosnia — Bugojno, Gornji
Vakuf-Uskoplje, Donji Vakuf, Jajce, Kupres, Travnik and Novi Travnik.

Sellers register and submit a listing. An admin reviews it, records the payment
that happened offline (bank transfer or cash), and publishes it with an expiry
date. Buyers browse, filter, save and enquire. **Money never moves through the
app** — the payments table is a ledger of what an admin wrote down, not a
payment system.

Three documents describe the project and are worth reading in this order:

| File | What it is |
|---|---|
| [SPEC.md](SPEC.md) | The agreed feature scope. What is in v1 and what is deliberately not. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Every technical decision and the reasoning behind it. |
| [CLAUDE.md](CLAUDE.md) | Working conventions for this repo. |

---

## Running it locally

**You need:** Node 20 or newer (CI and the Docker images run 24) and Docker
Desktop, running. Nothing else — no Postgres on your machine, no global CLIs.

```bash
git clone git@github.com:hbegic20/nekretnine-webshop.git
cd nekretnine-webshop
npm install                          # installs all three workspaces at once
cp backend/.env.example backend/.env # the only file you must create
npm run dev
```

That is the whole setup. Within about a minute you have a working site with
data in it.

### What `npm run dev` actually does

It is one command on purpose: "start the servers" and "make sure the database
they need exists and has a schema" are the same job from where you are sitting,
and splitting them is how you end up staring at a connection error.

1. **Checks the ground** — is Docker running, is the container stack already
   holding ports 3000/4000, is anything else on those ports. Each failure gets
   a message naming the fix rather than a bind error a minute later.
2. **Starts Postgres** in Docker and waits until it actually accepts
   connections, not merely until the container exists.
3. **Applies migrations** — every `.sql` file under `backend/src/db/migrations`
   that has not run yet.
4. **Seeds, but only into an empty database.** It counts the users first; if
   there are any, it skips. Re-seeding a database you have been working in
   would delete the listings you made.
5. **Runs both dev servers** with their output labelled `[api]` and `[web]`.

| | |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |
| Liveness | http://localhost:4000/health |
| Readiness (checks the DB) | http://localhost:4000/health/ready |

**Ctrl-C stops both servers and leaves Postgres running** — that is deliberate,
since the database takes the longest to start. Stop it too with
`npm run db:down` when you are done for the day.

### Environment files

| File | Required? | What it is for |
|---|---|---|
| `backend/.env` | **Yes** | `DATABASE_URL` has no default, so the API exits at boot without it. Copy it from `backend/.env.example` and change nothing — the defaults match the Docker Postgres. |
| `frontend/.env.local` | No | `next.config.ts` already falls back to `http://localhost:4000`. Copy `frontend/.env.example` only if you need the frontend pointed somewhere else. |

`.env` files are gitignored and always will be. `.env.example` files carry
placeholders only.

### The seed data

`npm run db:seed` creates:

- **3 accounts** — an admin and two sellers, so listings do not all come from
  one name
- **38 listings** across all seven towns and all five property types, priced
  from a 300 KM monthly rent to a 290,000 KM house
- **every status** — 31 `PUBLISHED`, 2 `PENDING`, 2 `DRAFT`, 2 `SOLD`, 1
  `EXPIRED`, 1 `REJECTED — so every tab in `/admin` has something in it, and
  31 published is past the 24-per-page limit so pagination actually paginates
- **2 featured listings**, and deliberately no more: paid placement is only
  worth something while most listings do not have it
- **~90 photos** — one to three per listing, because plenty of real sellers
  upload exactly one and a grid where every card has the same gallery depth
  hides what a thin listing looks like

The photos are *drawn, not downloaded*: SVG scenes rasterised by sharp, with a
different building per property type and four times of day. That keeps the seed
working offline, avoids a licence question, and still gives the card grid real
images to lay out. They go through the same resize, EXIF-strip and WebP
encoding as a genuine upload, at all three sizes.

Both accounts use the password `lozinka123`:

| Email | Role |
|---|---|
| `admin@nekretnine.test` | Admin — the moderation queue at `/admin` |
| `prodavac@nekretnine.test` | Seller — owns most of the sample listings |
| `agencija@nekretnine.test` | A second seller, so the admin queue is not one name |

Admins are made by promoting an existing user, never by signing up. There is no
public admin registration and there never will be (SPEC §2).

Seeding takes about fifteen seconds, almost all of it drawing and encoding
photos. It only runs automatically into an empty database.

**Re-seeding** (`npm run db:seed`) deletes the seed sellers' listings and their
photo files first, then recreates everything. Your own account and anything you
created under it are untouched. The photos are drawn from a fixed seed, so the
same listing gets the same picture every time — otherwise every reset would
reshuffle the grid and you could not tell a layout change from a data change.

### Starting from nothing again

When the database is in a state you would rather not debug:

```bash
docker compose -f infra/docker-compose.yml down -v   # -v deletes the volume too
npm run dev                                          # recreates, migrates, re-seeds
```

### Running the pieces separately

`npm run dev` is the convenient path, not the only one:

```bash
npm run db:up            # just Postgres
npm run db:migrate       # just the migrations
npm run db:seed          # just the seed
npm run dev:backend      # just the API, on 4000
npm run dev:frontend     # just Next, on 3000
npm run db:psql          # a psql shell inside the container
```

There is also a second database, `nekretnine_test`, which `npm run test:api`
creates and migrates by itself on first run. It lives on the same Postgres and
is truncated between tests, so your development data is never touched.

---

## What is built

Everything through Phase 7, plus a design pass and an SEO pass. The lifecycle
at the centre of it is
`DRAFT → PENDING → PUBLISHED → EXPIRED/SOLD`, with `REJECTED` as the side
branch that admin takedowns also land in.

**Auth** — email and password, argon2id hashing, sessions stored in Postgres
behind an HttpOnly cookie. Not JWT: sessions can be revoked, which is the whole
point. Each login gets its own session row, so signing out on your phone leaves
your laptop alone.

**Listings** — full CRUD for sellers over their own rows, with the moderation
rules enforced server-side. Changing the **price** of a live listing keeps it
live; changing anything else sends it back to the queue, which closes the
bait-and-switch route. Deleting is soft: the row keeps a `deleted_at` stamp so
its payment and inquiry history survive.

**Search** — town, property type, transaction type, price range, bedrooms,
bathrooms, size range, and free-text keyword search using a Postgres GIN index
with `unaccent`, so "kuca" typed on an English keyboard matches "kuća". Filters
live in the URL, so a search can be shared or bookmarked.

**Map** — every match plotted with MapLibre on OpenFreeMap tiles, which need
no API key and have no request limit, and which follow the light/dark theme.
Unpaginated. Coordinates come from
the seller dropping a pin during submission; there is no geocoding service.

**Detail pages** — server-rendered for SEO, with an image gallery, a small map,
contact details and an inquiry form. The street address is never shown publicly.

**Favorites** — `PUT /api/favorites/:id`, idempotent so a double click is not
an error. A saved listing that later expires or sells stays in the list, marked
unavailable.

**Inquiries** — stored in the database *before* the email is sent, so a
delivery failure loses a notification rather than a buyer's message. Honeypot
field, rate limited.

**Image uploads** — multiple per listing, behind a storage adapter (disk in
development, Cloudflare R2 in production). Each upload is encoded to WebP at
three sizes — 480px, 1000px and 1600px — so cards and the gallery can offer a
`srcset` and let the browser pick. EXIF is stripped, which matters more than it
sounds: phone photos routinely carry the GPS coordinates where they were
taken.

**Admin moderation** — the queue at `/admin`, a tab per status with live
counts. PENDING is ordered oldest first, because a queue is worked from the
front. The review page shows the listing as a buyer sees it, plus the owner's
contact details, the payment ledger, and how many inquiries and saves it has.

**Featured listings** — "izdvojeni oglas", the paid placement every portal in
this market sells. The admin either ticks a box while approving or stars any
live listing straight from the queue, and it then sorts first, spans two grid
columns and carries a gold ribbon for the period bought. The payment is
recorded the same way every other one is. Stored as an expiry date rather than a flag, so
nothing has to switch it off; sold listings still sort last, because prominence
among things nobody can buy is not what anyone paid for.

**Scheduled expiry** — an hourly job moves listings past their date to EXPIRED
and emails the seller, because a listing that vanishes silently looks like the
site lost it.

**Design** — one accent (a deep teal) against a considered neutral, expressed
entirely as CSS custom properties, so no component names a colour and the
palette moves from one file. Archivo for the interface, Source Serif 4 for
prices. Dark mode is a real three-way choice — light, dark, or follow the
system — applied before first paint so there is no flash.

**Findability** — a sitemap built from the live listings and regenerated
hourly, a robots.txt that keeps crawlers out of the private areas, and
`RealEstateListing` structured data on every published listing so a search
result can show the price, size and town. Bosnian 404 and error pages, because
the default ones are in English.

**Docker and CI** — the whole stack runs in containers, and GitHub Actions
lints, typechecks, tests and builds every pull request, then publishes both
images to GHCR on merge.

---

## Everyday commands

All of these run from the repository root.

| Command | What it does |
|---|---|
| `npm run dev` | The one above. Postgres + migrate + seed + both dev servers. |
| `npm test` | Unit tests. Fast, no database needed. |
| `npm run test:api` | Integration tests — the real API over HTTP against Postgres. |
| `npm run lint` | ESLint across all three workspaces. |
| `npm run typecheck` | `tsc --noEmit` across all three workspaces. |
| `npm run build` | Builds shared, backend and frontend, in that order. |
| `npm run db:up` / `db:down` | Start or stop just the Postgres container. |
| `npm run db:psql` | A psql shell inside the container. |
| `npm run db:generate` | Generate a migration from schema changes. |
| `npm run db:migrate` | Apply pending migrations. |
| `npm run db:seed` | Re-seed. Deletes the seed seller's listings first, photos included. |
| `npm run images:backfill` | Generate the 1000px rendition for images uploaded before it existed. Resumable. |
| `npm run job:expire` | Run the expiry job once, by hand. |
| `npm run stack:up` / `stack:down` / `stack:logs` | The whole thing in containers. |

**Never run `npm run dev` and `npm run stack:up` at the same time** — they
fight over ports 3000 and 4000. The dev script checks for this and tells you.

---

## Tests

Two suites, split because they need different things.

```bash
npm test          # unit — pure functions, milliseconds, no infrastructure
npm run test:api  # integration — real HTTP, real Postgres, ~15 seconds
```

The integration suite creates its own database (`nekretnine_test`) on the
Postgres you already run for development, applies the real migration files to
it, and truncates every table between test cases. Your development data is
never touched. Set `TEST_DATABASE_URL` if you want it somewhere else.

It covers auth and sessions, the listing lifecycle and every moderation rule,
search and filters against real SQL, favorites, inquiries, the admin queue, and
the expiry job. Both suites run in CI on every pull request.

Test files sit next to the code they test: `*.test.ts` for unit,
`*.itest.ts` for integration. The harness lives in `backend/src/test/`.

---

## Project layout

```
frontend/          Next.js 16 App Router, React 19, Tailwind v4
  app/             Pages — Bosnian URLs (/oglas, /mapa, /moji-oglasi, /sacuvano)
  components/      Form, card, gallery and moderation components
  lib/api.ts       The server-vs-browser fetch rules
backend/           Express 5 + TypeScript
  src/routes/      One file per resource
  src/services/    Business rules — the lifecycle lives in services/listings.ts
  src/db/          Drizzle schema and generated migrations
  src/storage/     Disk in dev, S3/R2 in prod, behind one interface
  src/mail/        Console in dev, SMTP in prod, same idea
  src/test/        Integration test harness
shared/            Types and constants imported by BOTH sides
infra/             docker-compose.yml and the two Dockerfiles
scripts/dev.sh     What npm run dev actually runs
```

`shared/` is the reason the town dropdown and the database enum cannot drift
apart: they are built from the same array.

---

## Changing the database

Schema changes go through migrations, always. Never edit tables by hand in
psql — the migration files are the source of truth, and a hand-edit makes them
a lie.

```bash
# 1. edit backend/src/db/schema.ts
npm run db:generate   # writes a new SQL file under src/db/migrations
# 2. read the generated SQL — it is not always what you meant
npm run db:migrate    # apply it
```

---

## When something goes wrong

**"port 3000 is already in use"** — the container stack is running. Stop it with
`npm run stack:down`, or find whatever else is listening with
`lsof -nP -iTCP:3000 -sTCP:LISTEN`.

**"Docker is not running"** — start Docker Desktop and try again.

**"Could not reach Postgres"** from the tests — `npm run db:up`.

**The database is in a strange state** — see
[Starting from nothing again](#starting-from-nothing-again).

**No photos on any card** — the seed only runs into an empty database, so a
database created before the photos existed has none. `npm run db:seed`
recreates them.

**"Failed to load module script … non-JavaScript MIME type"**, or a map that
renders as a black rectangle with working markers — `npm run build` was run
while `npm run dev` was live. They share `frontend/.next`, so the build
replaces chunks the running dev server is still serving, and the browser gets
a 404 HTML page where a script should be. MapLibre parses tiles in a worker
module, so a missing chunk shows up as a blank basemap rather than as an
error. Stop the dev server, `rm -rf frontend/.next`, and start it again.

**Uploaded images disappeared** — `backend/uploads/` is gitignored and local
only. In production the app refuses to start with `STORAGE_DRIVER=disk` at all,
because container filesystems are wiped on every deploy.

---

## Deploying

Nothing is live yet, but the configuration is in the repository and the runbook
is written: **[infra/prod/DEPLOY.md](infra/prod/DEPLOY.md)**.

The shape is the frontend on Netlify, the API as a Docker service on Render,
Postgres on Neon, images on Cloudflare R2 and email through Resend — every one
on a free plan. The browser only ever talks to Netlify, which forwards `/api/*`
to Render server-side, so there is no CORS and the session cookie is
first-party.

Two things in there are worth knowing before you need them: `BACKEND_URL`
changes require a **redeploy**, not a restart, because Next bakes rewrite
destinations into the build; and migrations run from a manual GitHub Actions
workflow rather than on API start-up.

---

## Not built yet

Sequenced, with the reasoning, in the
[roadmap](https://claude.ai/code/artifact/3af45852-d8fe-4467-8c72-e4832622627f).
The short version:

**Next**

- **Renewal reminders before expiry.** Today a seller learns their listing
  expired once it is already gone. "7 days left" is one more query beside the
  existing sweep, and renewal is the action that earns money.
- **The deploy itself.** Everything above the line is cheaper before launch;
  everything below wants real traffic.
- **Map viewport search.** `listings_status_lat_lng_idx` was built in Phase 3
  for exactly this and nothing queries it yet.

**After that**

- Price history and a "snižena cijena" badge — the edit path already treats
  price as the one field that does not trigger re-moderation.
- Seller signals: view counts and "prikaži broj".
- Similar listings, saved searches with email alerts, report-a-listing, a PWA
  manifest.

**Still open**

- Integration tests for the image upload route.
- Frontend tests — needs a decision on a test runner first, which would be a
  new dependency.
- Email verification and password reset, deferred to v1.1 (SPEC §4.1).
- An AI-assisted description writer, if the dependency and a budget are
  approved. The reasoning for that one, and for the AI features worth
  declining, is in the roadmap.
