-- Handwritten migration: full-text + fuzzy search infrastructure.
-- The GIN expression index below matches the exact expression used by
-- SearchService, so Postgres serves keyword search from the index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "messages_fts_idx" ON "messages" USING GIN (
  (
    setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("bodyText", '')), 'B')
  )
);

CREATE INDEX "contacts_name_trgm_idx" ON "contacts" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "contacts_email_trgm_idx" ON "contacts" USING GIN ("email" gin_trgm_ops);
