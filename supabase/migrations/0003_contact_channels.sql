-- Migration: add brand_voices.contact_channels — owner-allowlisted contact
-- channels the AI may reference in review replies. Each entry is an object
-- with id (uuid for stable keys), label (display name), value (literal
-- string the AI may insert), and when_to_use (owner-authored guidance).
--
-- Foundation only (PR A of 4). PR A ships nothing that reads this column;
-- subsequent PRs wire it into the validator (B), prompt (C), and UI (D).
--
-- Apply locally with `supabase db push` after `supabase link`, or paste
-- into the Supabase SQL editor for a remote project. Idempotent via
-- "if not exists" — re-running on a partial state is safe.

alter table brand_voices
  add column if not exists contact_channels jsonb not null default '[]'::jsonb;
