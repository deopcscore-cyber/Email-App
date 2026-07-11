-- A prior `prisma migrate dev` run detected the handwritten trigram indexes
-- from 20260710150000_search_indexes as unrepresented schema drift and
-- generated a migration that dropped them. That migration has been deleted;
-- this restores the indexes idempotently for any database that saw it.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "contacts_name_trgm_idx" ON "contacts" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contacts_email_trgm_idx" ON "contacts" USING GIN ("email" gin_trgm_ops);
