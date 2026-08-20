# Project: Real Estate Selling App

## What this is
A web app for browsing, listing, and selling real estate. Buyers search/filter
listings and view details; sellers/agents create and manage listings; admins
moderate. Scope is fixed in SPEC.md: sellers submit, an admin approves and
records an offline payment, buyers browse and enquire. Money never moves
through the app.

## Stack
Settled in Phase 2 — see ARCHITECTURE.md for the reasoning behind each line.
- Frontend: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4
- Backend: Express 5 + TypeScript, REST (FastAPI was considered and declined)
- Database: PostgreSQL 17. **No PostGIS** — plain `lat`/`lng` columns
- ORM/migrations: Drizzle (`drizzle-orm` + `drizzle-kit`)
- Auth: server-side sessions in Postgres + HttpOnly cookie. **Not JWT**
- Cross-origin: Next.js rewrites `/api/*` to the backend, so there is one origin
- Storage: `StorageAdapter` — disk in dev, Cloudflare R2 in prod
- Email: `Mailer` — console in dev, SMTP/Resend in prod
- No Redis, no Elasticsearch, no MinIO/Mailpit containers, no Stripe, no MLS feed
- Infra: Docker + docker-compose (Postgres only until Phase 5), GitHub Actions

## Folder structure
- /frontend       → Next.js app (`lib/api.ts` holds the server-vs-browser fetch rules)
- /backend        → Express API
  - src/routes    → one file per resource
  - src/services  → business rules
  - src/db        → Drizzle schema + generated migrations
  - src/storage, src/mail → the two adapters
- /shared         → types + constants imported by BOTH sides (towns, enums, lifecycle)
- /infra          → docker-compose.yml, Dockerfiles, CI configs
- SPEC.md         → agreed feature scope
- ARCHITECTURE.md → architecture decisions + diagrams
- DECISIONS.md    → running log of "why we chose X" (I maintain this myself)

## Conventions
- All API routes live under /backend/src/routes, one file per resource
- DB schema changes only via migrations — never hand-edit the schema
- Components are functional (no class components), hooks over HOCs
- Env vars go in .env.example with placeholder values — never commit real secrets
- Prices are integers in whole KM — never floats, never decimals
- Enums and shared vocabulary live in /shared, so the DB enum and the UI dropdown
  are built from the same array
- Local dev: `npm run db:up`, then `npm run dev:backend` and `npm run dev:frontend`
  in two terminals. The full docker-compose stack arrives in Phase 5

## Do NOT
- Don't add a new dependency (npm/pip package, external service) without asking first
- Don't touch anything under /infra/prod without explicit confirmation
- Don't skip the phase checkpoints in the build prompt — stop and wait for my go-ahead

## Working style
- Explain architectural reasoning in plain language as you go, not just code
- If you're about to make a nontrivial design decision, propose it and wait for approval
- If I correct you on the same thing twice, that's a signal to add a rule here