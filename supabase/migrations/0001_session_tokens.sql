-- Migration: add session_tokens for refresh-token-backed sessions
--
-- Apply locally with `supabase db push` (after `supabase link`), or paste
-- into the Supabase SQL editor for a remote project. Idempotent only via
-- "if not exists" — re-running on a partial state will not break.

create table if not exists session_tokens (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false
);

create index if not exists session_tokens_owner_id_idx   on session_tokens(owner_id);
create index if not exists session_tokens_expires_at_idx on session_tokens(expires_at);

alter table session_tokens enable row level security;

drop policy if exists "no client access to session tokens" on session_tokens;
create policy "no client access to session tokens"
  on session_tokens
  for all
  using (false);
