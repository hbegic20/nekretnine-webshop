DROP INDEX "listings_status_published_at_idx";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "listings_status_published_at_idx" ON "listings" USING btree ("status","published_at" DESC NULLS LAST) WHERE deleted_at is null;