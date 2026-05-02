-- Migration: add brand_voices.auto_detect_language to persist the
-- "Respond in the language of each review" toggle from onboarding step 2.
--
-- Apply locally with `supabase db push` after `supabase link`, or paste into
-- the Supabase SQL editor for a remote project. Idempotent via "if not
-- exists" — re-running on a partial state is safe.

alter table brand_voices
  add column if not exists auto_detect_language boolean not null default false;
