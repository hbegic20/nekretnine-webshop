# Deploying to production

The runbook. Follow it top to bottom the first time; after that only the parts
you need.

```
        browser
           │  https://<site>.netlify.app
           ▼
   ┌───────────────┐   /api/* rewritten server-side
   │    Netlify    │────────────────────────┐
   │   (frontend)  │                        ▼
   └───────────────┘              ┌──────────────────┐
                                  │      Render      │
                                  │   (Express API)  │
                                  └────────┬─────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
                   ┌─────────┐      ┌─────────────┐    ┌────────────┐
                   │  Neon   │      │ Cloudflare  │    │   Resend   │
                   │ Postgres│      │     R2      │    │   (email)  │
                   └─────────┘      └─────────────┘    └────────────┘
```

The browser only ever talks to Netlify. Netlify forwards `/api/*` to Render
server-side, which is why there is no CORS anywhere in this project and why the
session cookie is first-party (ARCHITECTURE.md §5.3).

**Everything below is on a free plan.** What that costs you is in
[Living with the free tier](#living-with-the-free-tier) — read it before you
show the site to anyone, because the first visit after a quiet hour takes about
a minute.

---

## Before you start

Four accounts, all free, none needing a card:
[Neon](https://neon.com), [Cloudflare](https://dash.cloudflare.com),
[Resend](https://resend.com), [Render](https://render.com), plus
[Netlify](https://netlify.com).

Do them in this order — each step needs a value from the one before.

---

## 1. Database — Neon

1. Create a project. **Region: Europe (Frankfurt)**, to sit next to the API.
2. Name the database `nekretnine`.
3. Copy the connection string, and make two changes to it:
   - use the **pooled** host (the one containing `-pooler`) — Neon's free
     compute allows few direct connections and our pool opens up to 10
   - replace `?sslmode=require` with **`?sslmode=verify-full`**

   `require` encrypts the connection but does not verify the certificate — `pg`
   sets `rejectUnauthorized: false` for it, which protects against
   eavesdropping and not against something impersonating your database.
   `verify-full` checks both certificate and hostname, and needs no extra
   configuration because Neon's certificate is signed by a CA Node already
   trusts.

Keep that string. It is `DATABASE_URL`.

## 2. Images — Cloudflare R2

1. R2 → Create bucket, name it `nekretnine-images`, location Europe.
2. Settings → **Public access** → enable the `r2.dev` subdomain (or attach a
   custom domain). Copy that URL — it is `S3_PUBLIC_BASE_URL`.
3. R2 → Manage API tokens → Create token, **Object Read & Write**, scoped to
   this bucket. Copy the access key id and secret; the secret is shown once.
4. `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com` — the
   account id is in the R2 sidebar.

`S3_REGION` is the literal string `auto`. R2 requires it.

## 3. Email — Resend

1. Add and verify your sending domain (DNS records — this is the slowest step,
   allow for propagation).
2. Create an API key.
3. `SMTP_URL` is `smtps://resend:<api-key>@smtp.resend.com:465` — the username
   is literally `resend`.
4. `MAIL_FROM` must be on the verified domain, e.g.
   `Nekretnine <noreply@your-domain.ba>`.

Without a verified domain, mail is accepted and never delivered, which looks
exactly like the app not sending it.

## 4. API — Render

1. New → **Blueprint** → this repository → blueprint path
   `infra/prod/render.yaml`.
2. Render creates a Docker web service in Frankfurt on the free plan, building
   from `infra/docker/Dockerfile.backend` — the same image `npm run stack:up`
   runs locally.
3. Fill in every variable marked `sync: false` from the steps above. The full
   list with placeholder values is in
   [`.env.production.example`](.env.production.example).
4. Deploy, then watch the logs. `env.ts` validates configuration at boot and
   exits with a plain-language message rather than starting half-configured, so
   a missing variable tells you which one.

Copy the service URL (`https://nekretnine-api.onrender.com`). It is
`BACKEND_URL`.

> The API is publicly reachable. That is required — Netlify's rewrite runs on
> Netlify's servers, not in the browser — but it means the rate limits in
> `http/rate-limit.ts` are the only thing in front of it.

## 5. Migrate the database

The schema does not exist yet. Migrations deliberately do **not** run when the
API starts (ARCHITECTURE.md §7), and Render's pre-deploy command is paid-only,
so they run from GitHub Actions instead:

1. Repository → Settings → Secrets and variables → Actions → New secret,
   named `PRODUCTION_DATABASE_URL`, holding the Neon string from step 1.
2. Actions → **Migrate production database** → Run workflow → type `migrate`.

It prints the migration files it is about to apply. Re-running it is safe:
Drizzle records what has already run.

## 6. Frontend — Netlify

1. Add new site → Import from Git → this repository.
2. **Leave the base directory empty** and set the **package directory** to
   `frontend`. That combination is what makes an npm-workspaces monorepo work:
   dependencies install from the repository root, so the `shared` workspace is
   linked, while Netlify looks in `frontend/` for the site and its
   `netlify.toml`.
3. Build command and publish directory come from
   [`frontend/netlify.toml`](../../frontend/netlify.toml) — leave them alone.
4. Site configuration → Environment variables → add `BACKEND_URL`, set to the
   Render URL from step 4.
5. Deploy.

> **`BACKEND_URL` changes need a redeploy, not a restart.** Next resolves
> rewrite destinations during `next build` and bakes them into
> `routes-manifest.json`. Changing the variable alone leaves the old address
> compiled into the site — the single most confusing thing about deploying
> Next.js, and the usual cause of "works locally, 404s in production".

## 7. Create the first admin

There is no public admin signup, ever (SPEC.md §2), and the seed script refuses
to run against a production database. So:

1. Register normally through the live site.
2. In the Neon SQL editor:

   ```sql
   update users set is_admin = true where lower(email) = 'you@your-domain.ba';
   ```

3. Sign out and back in, and `/admin` opens.

---

## Verify it actually works

In order, because each one depends on the last:

| Check | How | If it fails |
|---|---|---|
| API is alive | `curl https://<api>.onrender.com/health` | Render logs — `env.ts` names the missing variable |
| API reaches the database | `curl https://<api>.onrender.com/health/ready` → `"database":"up"` | `DATABASE_URL`, or you skipped step 5 |
| The proxy works | `curl https://<site>.netlify.app/api/listings` | `BACKEND_URL` wrong, or set after the build — redeploy |
| Server rendering works | Open the site; view source and find listing titles in the HTML | `BACKEND_URL` missing at *runtime* — Server Components call the API directly, not through the rewrite |
| Sessions work | Register, reload the page, stay signed in | Cookie needs HTTPS in production; both hosts are HTTPS, so suspect the proxy hop |
| Uploads work | Add a photo to a listing, then reload it | `S3_*` values; check the image URL resolves publicly |
| Email works | Send yourself an inquiry through a listing | Resend domain not verified, or `MAIL_FROM` off-domain |

**One more, worth doing deliberately: check what IP the API sees.** Every
request arrives from Netlify's servers, so if `req.ip` resolves to a Netlify or
Render address rather than the visitor's, the per-IP rate limits in
`http/rate-limit.ts` become one shared bucket for the whole internet — one
person hammering login would lock out everybody. `app.ts` sets
`trust proxy: 1`; with Netlify and Render both adding a hop, the right value in
production may be `2`. Compare a login attempt's logged IP against
[your own](https://ifconfig.me) before trusting the limits.

---

## Living with the free tier

| Service | Free allowance | What it means here |
|---|---|---|
| Render | 512 MB, 0.1 CPU | **Sleeps after ~15 minutes idle**; the next visit waits ~50s. The fix is $7/mo, not a migration. |
| Neon | 0.5 GB storage, 100 CU-hours | Scales to zero after 5 min; first query then takes a second or two. Plenty for <500 listings. |
| R2 | 10 GB, free egress | Roughly 5,000 photos at our sizes. Egress is always free. |
| Resend | 3,000/month but **100/day** | The daily cap is the one that bites — an expiry run over many listings could hit it. |
| Netlify | 100 GB bandwidth, 300 build-min | Comfortable at this traffic. |

The expiry job runs in-process on an hourly timer, so on a sleeping service
listings expire at the next wake rather than on the hour. They still expire,
and nobody minds a listing staying up an extra hour — but it is why the job was
left as a timer instead of a paid cron.

---

## Rolling back

- **Frontend:** Netlify → Deploys → an earlier deploy → Publish deploy.
  Instant, and it restores the exact bundle.
- **API:** Render → Events → the previous deploy → Rollback. The image is
  already built, so this is a restart rather than a rebuild.
- **Database:** migrations have no `down`. Neon's branching or
  point-in-time restore is the recovery path — take a branch before anything
  destructive, since a bad migration is the one failure the two rollbacks above
  cannot undo.

## Routine deploys, after the first time

Push to `main`. Netlify and Render both rebuild on their own. If the push
contains a new migration, run the migrate workflow **first** — an API expecting
a column that does not exist yet fails every request that touches it.
