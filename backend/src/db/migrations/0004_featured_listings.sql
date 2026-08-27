-- Featured listings — "izdvojeni oglas", the paid placement every portal in
-- this market sells.
--
-- A date rather than a boolean, and that is the whole design: a flag would
-- need something to come along and turn it off, which is a job that gets
-- forgotten. An expiry answers "is this featured?" at read time, needs no
-- sweeper, and cannot leave a listing promoted forever because a cron job
-- failed one night.
--
-- Nullable means "never featured". A date in the past means "was featured,
-- is not now", which is worth keeping: it is the record that the seller paid
-- for placement, and the payments row alone does not say what they bought.
ALTER TABLE "listings" ADD COLUMN "featured_until" timestamptz;

-- The public list sorts featured rows first, so the planner wants them
-- findable without scanning. Partial, because rows that were never featured
-- are the overwhelming majority and do not belong in the index.
CREATE INDEX "listings_featured_until_idx" ON "listings" ("featured_until")
  WHERE "featured_until" IS NOT NULL;
