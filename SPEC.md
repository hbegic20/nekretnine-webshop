# SPEC — Real Estate Listing App (v1)

**Status:** agreed in Phase 1, 2026-08-20. Changes to this document should be
made deliberately, not drifted into.

---

## 1. What this is

A web app where private sellers and agents publish property listings, and
buyers browse, search, and enquire about them. Every listing is reviewed by an
admin before it goes live; listing fees are paid **offline** (bank transfer or
cash) and recorded by the admin at the moment of approval. The app never
touches money.

The moderation queue is not an afterthought — it is the core of the product.
Everything else exists to feed it or to display its output.

---

## 2. Users and roles

| Role | Account required? | Can do |
|---|---|---|
| **Visitor** | No | Browse, search, filter, view listing detail, view map, send an inquiry |
| **Buyer** | Yes | Everything a visitor can, plus save listings to favorites |
| **Seller / Agent** | Yes | Create and edit their own listings, upload images, submit for review, see status and expiry, mark as sold |
| **Admin** | Yes (granted, not self-registered) | Review the pending queue, approve/reject with a reason, record an offline payment, set expiry, unpublish, manage all listings and users |

Notes that fall out of this table:

- Browsing is deliberately open to anonymous visitors. Forcing signup to look
  at property is the fastest way to lose traffic.
- Favorites is the *only* reason a buyer needs an account in v1.
- A single person can hold both the seller and buyer capability — roles are
  additive flags on one user account, not separate account types.
- Admins are created by promoting an existing user (a script or a direct DB
  update in v1). There is no public admin signup, ever.

---

## 3. Listing lifecycle

```
DRAFT ──submit──> PENDING ──approve──> PUBLISHED ──┬──expires──> EXPIRED
  ^                  │                             │
  │                  └──reject──> REJECTED         └──seller──> SOLD
  └──────────────edit────────────────┘
```

- **DRAFT** — seller is still working on it. Visible only to its owner.
- **PENDING** — submitted, waiting for admin. Visible to owner and admins.
- **REJECTED** — admin declined, with a reason the seller can read. Editable
  back into DRAFT and resubmittable. Also where an **admin takedown** lands:
  pulling something already live off the site reuses this status rather than
  inventing another, because the recovery path is identical — the seller edits,
  which moves it to DRAFT, and resubmits.
- **PUBLISHED** — live and publicly visible. Has a `published_at` and an
  `expires_at`.
- **EXPIRED** — past `expires_at`. Removed from public search automatically.
  The seller can request renewal (which returns it to PENDING).
- **SOLD** — seller marked it sold. Excluded from browse results by default
  and included via `?includeSold=1`, where it sorts last whatever else is
  chosen. It still opens at its own URL: links to it get shared, and sold
  listings are the only price history this market has.

Only PUBLISHED (and SOLD, when explicitly included) listings are ever returned
by public endpoints. This is enforced in the API, not in the UI.

**Editing a PUBLISHED listing** (decided 2026-08-20): changing the **price**
keeps it live, because price cuts are the most common edit and should not wait
for approval. Changing anything else returns it to PENDING, which closes the
bait-and-switch route — get a clean listing approved, then rewrite it. The edit
form warns before saving, and the API response says whether it happened.
Admins are exempt; an admin editing a live listing *is* moderation.

**Deleting** (decided 2026-08-20) is a soft delete. The row keeps its
`deleted_at` stamp and vanishes from every view, but its `payments` rows — the
record that this person paid us — and its inquiry history survive. A hard
delete would cascade both away, and losing financial records to a misclick is
not a trade worth making.

---

## 4. In scope for v1

### 4.1 Auth
Email + password signup and login, with roles (buyer / seller / admin) as
flags on the user record. Session handling, logout, and password hashing.
Email verification and password reset are **v1.1** unless they turn out to be
trivial to add on the chosen auth approach.

### 4.2 Listings CRUD
Sellers create, edit, and delete their own listings. Fields (final list settled
in Phase 3's schema, but at minimum):

- Title, description
- Price, currency
- Property type (apartment / house / land / commercial / garage)
- Transaction type (sale / rent)
- Size in m², rooms, bedrooms, bathrooms, floor, year built
- Town, neighbourhood, address (address optional and never shown in full publicly)
- Latitude / longitude
- Contact name, phone, email
- Status, timestamps, expiry

Buyers and visitors get read-only views. Authorization is checked server-side
on every write: a seller may only touch rows they own. A listing someone may
not see returns **404, not 403** — a 403 would confirm that a listing with that
id exists, which a stranger has no need to know.

### 4.3 Search and filters
Filter by town, price range, property type, transaction type, number of
bedrooms/bathrooms, size range, and a free-text keyword over title and
description. Results are paginated and sortable (newest, price ascending,
price descending). Filters are reflected in the URL so a search can be shared
or bookmarked.

At the target scale, plain PostgreSQL indexes and full-text search are
sufficient — no dedicated search engine.

### 4.4 Map view
Published listings plotted on a map, with the filter set applied. Clicking a
marker opens a preview card linking to the detail page. Coordinates come from
the seller dropping a pin during submission — **no geocoding service in v1**,
which avoids an external dependency and an API key.

Exact pin location for a listing is shown as given; if privacy becomes a
concern later we can fuzz the marker, but v1 does not.

### 4.5 Listing detail page
Image gallery, full description, all attributes, a small map, the seller's
contact details, and an inquiry form. Server-rendered for SEO.

### 4.6 Favorites
A logged-in buyer can save and unsave a listing, and see their saved list on
one page. A favorited listing that later expires or sells stays in the list,
in a separate "no longer available" section — removing it silently would leave
someone certain they had saved a flat that has since vanished.

Save is `PUT /api/favorites/:id`, not POST, because the operation is
idempotent: a double click, a retry on a flaky connection, or a duplicate
request should all end with the listing saved and no error.

### 4.7 Inquiries
A form on the detail page (name, email, phone, message) that emails the
seller and stores a copy in the database so nothing is lost if mail delivery
fails. Rate-limited and spam-protected (honeypot field at minimum). Visible to
admins for abuse handling.

### 4.8 Image uploads
Multiple images per listing, stored in an S3-compatible bucket — not in the
database and not in the repo. One image is the cover. Reordering, deletion,
size limits, and type validation. Thumbnails generated on upload.

### 4.9 Admin moderation
A queue at `/admin`, with a tab per status and a live count on each. PENDING is
ordered **oldest first** — the opposite of every other list in the app, because
a queue is worked from the front, and newest-first would leave whoever
submitted three days ago waiting behind everyone since.

The review page shows the listing exactly as a buyer would see it (reviewing
anything less means approving something you have not actually looked at),
alongside the owner's contact details, the payment ledger, and how many
inquiries and saves it has — the closest thing to evidence the queue has, and
worth a glance before taking something down.

Approving sets the expiry duration and records the offline payment (amount,
method, date, note). The payment is only written when money actually changed
hands: an amount of zero recorded as a payment would be a lie in the ledger,
since "they paid nothing" and "we did not charge them" are different facts.

Admin pages return **404 to non-admins**, not 403 or a login redirect. Someone
signed in as a buyer being sent to a login page is nonsense, and a 404 tells a
prober less than a 403 does.

---

## 5. Explicitly out of scope for v1

Listed so we can say "no" quickly later without relitigating:

- **In-app messaging** between buyer and seller — the inquiry email covers it
- **Online payments / Stripe** — money is handled offline, by hand
- **MLS or external data feed import** — every listing is user-submitted
- Saved searches and email alerts
- Mortgage calculators, valuation estimates, price history
- Multi-language UI (one language in v1)
- Mobile apps
- Agency accounts with multiple sub-users
- Reviews or ratings of agents

---

## 6. Scale and data assumptions

- **Under ~500 listings**, growing slowly. This is the single most important
  number in the document: it is why we need no search engine, no read
  replicas, no caching layer, and no sharding.
- Tens of images per listing at most, a few MB each.
- Traffic in the low thousands of page views per month.
- Every listing is entered by a human through our own form.

If listings ever pass roughly 10,000, or search latency becomes visible,
revisit section 4.3 — not before.

---

## 7. Non-functional requirements

- The whole stack runs locally with `docker-compose up`
- No secrets in the repository; `.env.example` files with placeholders only
- Schema changes only via migrations
- Server-rendered listing pages, for search engines
- Basic accessibility: keyboard navigation, alt text on images, sane contrast
- Rate limiting on auth, inquiry, and upload endpoints

---

## 8. Assumptions I made, worth correcting if wrong

1. **Geography.** I have assumed the same seven-town coverage as the earlier
   plan — Bugojno, Gornji Vakuf-Uskoplje, Donji Vakuf, Jajce, Kupres, Travnik,
   Novi Travnik — with town as a fixed dropdown rather than free text. Fixed
   towns make filtering and map centring much simpler.
2. **Language.** UI copy in Bosnian, code and documentation in English.
3. **Currency.** KM (BAM), single currency, no conversion.
4. **Both sale and rent** are supported, with sale as the primary case.
5. **Expiry default** of 60 days, changeable by the admin per listing.

None of these block Phase 2. Correct any that are wrong and I will amend this
file.
