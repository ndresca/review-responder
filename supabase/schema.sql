-- ============================================================
-- autoplier schema
-- ============================================================
-- Run against a fresh Supabase project via the SQL editor or
-- the Supabase CLI: supabase db push
-- ============================================================

-- ─── 1. locations ────────────────────────────────────────────

create table locations (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  google_location_id  text not null unique,   -- GBP resource path: "accounts/.../locations/..."
  name                text not null,
  created_at          timestamptz not null default now()
);

create index locations_owner_id_idx on locations(owner_id);

alter table locations enable row level security;

create policy "owners can manage their own locations"
  on locations
  for all
  using (auth.uid() = owner_id);

-- ─── 2. brand_voices ─────────────────────────────────────────

create table brand_voices (
  id                             uuid primary key default gen_random_uuid(),
  location_id                    uuid not null references locations(id) on delete cascade,
  personality                    text not null,
  avoid                          text not null default '',
  signature_phrases              text[] not null default '{}',
  language                       text not null default 'en',
  -- When true, generate responses in the language of each incoming review
  -- (auto-detected by the LLM). When false, every response is written in
  -- `language`. Defaults to false because it's an opt-in capability that
  -- needs explicit owner consent — auto-detection occasionally misclassifies
  -- short or mixed-language reviews.
  auto_detect_language           bool not null default false,
  owner_description              text,
  calibrated_at                  timestamptz,
  calibration_examples_accepted  int not null default 0,
  auto_post_enabled              bool not null default false
);

create index brand_voices_location_id_idx on brand_voices(location_id);

alter table brand_voices enable row level security;

create policy "owners can manage brand voices for their locations"
  on brand_voices
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = brand_voices.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 3. oauth_tokens ─────────────────────────────────────────
--
-- Encrypted columns use AES-256-GCM.
-- The decryption key lives in the OAUTH_ENCRYPTION_KEY environment variable
-- (32 bytes, base64-encoded) and is NEVER stored in the database.
-- Each value is stored as a base64 ciphertext alongside its unique IV.
-- See src/lib/crypto.ts for the encrypt/decrypt implementation.

create table oauth_tokens (
  id                        uuid primary key default gen_random_uuid(),
  location_id               uuid not null references locations(id) on delete cascade unique,
  access_token_encrypted    text not null,    -- AES-256-GCM ciphertext (base64)
  access_token_iv           text not null,    -- AES-256-GCM IV (base64)
  refresh_token_encrypted   text not null,    -- AES-256-GCM ciphertext (base64)
  refresh_token_iv          text not null,    -- AES-256-GCM IV (base64)
  expires_at                timestamptz not null,
  refreshing_since          timestamptz       -- set when a refresh is in progress; prevents concurrent refreshes
);

create index oauth_tokens_location_id_idx on oauth_tokens(location_id);

alter table oauth_tokens enable row level security;

-- Token reads/writes go through service role only (cron jobs, OAuth callbacks).
-- No direct client access — RLS blocks all auth.uid()-based access by default.
create policy "no direct client access to oauth tokens"
  on oauth_tokens
  for all
  using (false);

-- ─── 4. calibration_sessions ─────────────────────────────────

create table calibration_sessions (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references locations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'in_progress'
                check (status in ('in_progress', 'complete'))
);

create index calibration_sessions_location_id_idx on calibration_sessions(location_id);
create index calibration_sessions_status_idx on calibration_sessions(status);

alter table calibration_sessions enable row level security;

create policy "owners can manage calibration sessions for their locations"
  on calibration_sessions
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = calibration_sessions.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 5. calibration_examples ─────────────────────────────────

create table calibration_examples (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references calibration_sessions(id) on delete cascade,
  location_id    uuid not null references locations(id) on delete cascade,
  scenario_type  text not null
                 check (scenario_type in (
                   '5star', '4star_minor', '3star_mixed', '1star_harsh',
                   'complaint_food', 'complaint_service', 'complaint_wait',
                   'multilingual'
                 )),
  review_sample  text not null,
  ai_response    text not null,
  decision       text not null default 'pending'
                 check (decision in ('pending', 'accepted', 'rejected', 'edited')),
  edited_text    text,          -- owner's version when decision = 'edited'
  created_at     timestamptz not null default now()
);

create index calibration_examples_location_id_idx on calibration_examples(location_id);
create index calibration_examples_session_id_idx  on calibration_examples(session_id);
create index calibration_examples_decision_idx     on calibration_examples(decision);

alter table calibration_examples enable row level security;

create policy "owners can manage calibration examples for their locations"
  on calibration_examples
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = calibration_examples.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 6. reviews ──────────────────────────────────────────────

create table reviews (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade,
  google_review_id  text not null,
  reviewer_name     text not null default '',
  rating            smallint not null check (rating between 1 and 5),
  text              text not null default '',
  created_at        timestamptz not null,
  responded_at      timestamptz,

  unique (location_id, google_review_id)
);

create index reviews_location_id_idx      on reviews(location_id);
create index reviews_google_review_id_idx on reviews(google_review_id);
create index reviews_responded_at_idx     on reviews(responded_at) where responded_at is null;

alter table reviews enable row level security;

create policy "owners can view reviews for their locations"
  on reviews
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = reviews.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 7. responses_posted ─────────────────────────────────────

create table responses_posted (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references locations(id) on delete cascade,
  review_id       text not null,    -- google_review_id (denormalised for fast lookup)
  text            text not null,
  posted_at       timestamptz,      -- null until status = 'posted'
  status          text not null default 'posted'
                  check (status in ('posted', 'failed', 'retrying', 'blocked_pending_regen')),
  failure_reason  text,
  attempts        int not null default 0,

  -- Prevents the same review from getting two response rows (idempotency)
  unique (location_id, review_id)
);

create index responses_posted_location_id_idx on responses_posted(location_id);
create index responses_posted_review_id_idx   on responses_posted(review_id);
create index responses_posted_status_idx      on responses_posted(status);

alter table responses_posted enable row level security;

create policy "owners can view responses for their locations"
  on responses_posted
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = responses_posted.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 8. subscriptions ──────────────────────────────────────────

create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  location_id              uuid not null references locations(id) on delete cascade unique,
  stripe_customer_id       text not null,
  stripe_subscription_id   text not null,
  status                   text not null default 'trialing'
                           check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_end       timestamptz,
  created_at               timestamptz not null default now()
);

create index subscriptions_location_id_idx on subscriptions(location_id);
create index subscriptions_status_idx      on subscriptions(status);

alter table subscriptions enable row level security;

create policy "owners can view their own subscriptions"
  on subscriptions
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = subscriptions.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 9. notification_preferences ─────────────────────────────

create table notification_preferences (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade unique,
  digest_frequency  text not null default 'weekly'
                    check (digest_frequency in ('daily', 'weekly')),
  digest_day        int check (digest_day between 0 and 6),  -- 0=Sun … 6=Sat; null for daily
  digest_time       int not null default 9
                    check (digest_time between 0 and 23),    -- hour in owner's timezone
  timezone          text not null default 'UTC',
  failure_alerts    bool not null default true,
  last_digest_sent_at  timestamptz  -- prevents duplicate sends within the same hour window
);

create index notification_preferences_location_id_idx on notification_preferences(location_id);

alter table notification_preferences enable row level security;

create policy "owners can manage notification preferences for their locations"
  on notification_preferences
  for all
  using (
    exists (
      select 1 from locations
      where locations.id = notification_preferences.location_id
        and locations.owner_id = auth.uid()
    )
  );

-- ─── 9. session_tokens ───────────────────────────────────────
-- Refresh tokens for the autoplier_refresh cookie. The cookie holds the raw
-- 32-byte token; we store its SHA-256 hash here so a DB read leak doesn't
-- yield usable credentials. Lookup is by token_hash (indexed).
--
-- expires_at = 30 days from creation. revoked is set to true on logout
-- (delete-account, future signOut endpoints). Refresh endpoint only
-- considers tokens where revoked=false AND expires_at > now().

create table session_tokens (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false
);

create index session_tokens_owner_id_idx   on session_tokens(owner_id);
create index session_tokens_expires_at_idx on session_tokens(expires_at);

alter table session_tokens enable row level security;

-- Service role only. The token cookie is the credential — no auth.uid()-
-- based access path makes sense because the refresh endpoint is the only
-- caller and it uses the service-role client.
create policy "no client access to session tokens"
  on session_tokens
  for all
  using (false);
