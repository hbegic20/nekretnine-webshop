-- HAND-EDITED after generation. drizzle-kit wrote the ALTER TABLE and the
-- CREATE INDEX at the bottom; everything above them was added by hand, because
-- the generated column cannot be created until the function it calls exists.
--
-- Why f_unaccent has to exist at all:
--
--   Postgres will only build a generated column or an index on an expression
--   it considers IMMUTABLE — one guaranteed to return the same answer forever
--   for the same input. The `unaccent()` shipped by the extension is merely
--   STABLE, because it reads a dictionary that could in principle be replaced,
--   which would silently invalidate every index built on it.
--
--   The two-argument form names the dictionary explicitly, removing the
--   run-time lookup, so wrapping it in our own function and declaring that
--   IMMUTABLE is the accepted recipe. We are promising not to swap the
--   dictionary out underneath it. If anyone ever does, this index must be
--   rebuilt.
--
-- Why it matters here: without unaccent, "Gornji Vakuf" typed without
-- diacritics would not match "Gornji Vakuf" in a listing — and the phone
-- keyboards most buyers use do not produce č, ć, š, ž or đ by default. Search
-- would appear to work for you and fail for them.

CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $func$
  SELECT public.unaccent('public.unaccent', $1)
$func$;--> statement-breakpoint

ALTER TABLE "listings" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(neighbourhood, '')))) STORED;--> statement-breakpoint
CREATE INDEX "listings_search_vector_idx" ON "listings" USING gin ("search_vector");
