# autoplier

AI-powered review response tool for restaurants. Google-first MVP.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm test           # Vitest unit tests (run once)
npm run test:watch # Vitest watch mode
```

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/google/route.ts                # GET — initiates Google OAuth (state cookie + nonce)
│   │   ├── auth/google/callback/route.ts       # GET — mints sb-* JWT + autoplier_refresh after OAuth
│   │   ├── auth/refresh/route.ts               # POST/GET — trades autoplier_refresh for fresh sb-* JWT
│   │   ├── cron/route.ts                       # GET — Vercel cron handler (CRON_SECRET-gated)
│   │   ├── dashboard/load/route.ts             # GET — dashboard hydration (RLS via sb-* JWT)
│   │   ├── history/load/route.ts               # GET — review history (RLS via sb-* JWT)
│   │   ├── onboarding/calibrate/route.ts       # POST/PATCH — generate + revise calibration examples
│   │   ├── onboarding/golive/route.ts          # POST — flip auto_post_enabled at end of onboarding
│   │   ├── settings/load/route.ts              # GET — settings hydration
│   │   ├── settings/save/route.ts              # POST — owner edits brand voice + notifications
│   │   ├── settings/toggle-auto-post/route.ts  # POST — pause/resume auto-replies
│   │   ├── settings/disconnect-google/route.ts # POST — clear oauth_tokens, disable auto-post
│   │   ├── settings/cancel-subscription/route.ts # POST — Stripe cancel_at_period_end
│   │   ├── settings/delete-account/route.ts    # DELETE — cascade-delete + revoke refresh tokens
│   │   ├── stripe/checkout/route.ts            # POST — creates Stripe checkout session
│   │   └── stripe/webhook/route.ts             # POST — handles Stripe webhook events
│   ├── dashboard/page.tsx            # Dashboard — status hero, activity feed, auto-reply toggle
│   ├── onboarding/page.tsx           # Onboarding — 5-step wizard
│   ├── settings/page.tsx             # Settings — location, brand voice, notifications, danger zone
│   ├── history/page.tsx              # Full review-response timeline
│   ├── error/page.tsx                # OAuth + general error variants
│   ├── privacy/page.tsx              # Privacy policy (RSC, force-dynamic for i18n)
│   ├── globals.css                   # Global design tokens from DESIGN.md
│   ├── layout.tsx                    # Root layout with Google Fonts
│   └── page.tsx                      # Landing page (RSC, force-dynamic for i18n)
├── components/
│   ├── Footer.tsx             # Site-wide footer with English/Español language toggle
│   ├── EditableResponse.tsx   # Inline-edit AI responses on dashboard/history
│   └── LogoFull.tsx
├── lib/
│   ├── crypto.ts              # AES-256-GCM encrypt/decrypt (OAUTH_ENCRYPTION_KEY)
│   ├── session.ts             # getValidSession (sb-* JWT) + getAuthedSupabase (RLS)
│   ├── session-mint.ts        # mint sb-* JWT, issue/revoke autoplier_refresh
│   ├── i18n.ts                # Translation type + EN/ES dictionaries (server-safe)
│   ├── i18n-client.ts         # useTranslation hook + setLanguage (client only)
│   ├── i18n-server.ts         # getServerTranslation for RSC pages
│   ├── review-safety.ts       # Layer 1: classifier — drops injection-shaped GBP reviews
│   ├── output-allowlist.ts    # Layer 3+4: URL/phone allowlist + delimiter-echo check
│   ├── sanitize.ts            # Owner-controlled field sanitizer (line-prefix scrubber)
│   ├── gbp-client.ts          # Google Business Profile API wrapper
│   └── types.ts               # Shared types: BrandVoice, Review, CalibrationExample
├── prompts/
│   ├── calibration.ts         # Prompt builder for onboarding calibration (delimiter-wrapped)
│   ├── generate-response.ts   # Prompt builder for auto-post (auto_detect_language branch)
│   └── quality-check.ts       # Prompt builder + QualityCheckResult type
├── services/
│   └── auto-post.ts           # Core auto-post loop — processOneReview with 3-layer defense
└── middleware.ts              # Edge auth gate — sb-* JWT or autoplier_refresh
supabase/
├── schema.sql                          # Authoritative Postgres schema with RLS
└── migrations/
    ├── 0001_session_tokens.sql         # Refresh-token table (RLS using(false))
    └── 0002_auto_detect_language.sql   # brand_voices.auto_detect_language column
vercel.json                    # Cron schedule
```

## Environment variables

See `.env.example`. Required for cron jobs: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OAUTH_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`. OAuth flow also needs `GOOGLE_REDIRECT_URI` and `SUPABASE_JWT_SECRET` (for minting sb-* cookies). Stripe integration requires `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`. Optional: `NEXT_PUBLIC_APP_URL` (canonical app URL for Stripe redirects), `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` (for digest emails).

## Internationalization (i18n)

- Default English; Spanish (`es`) via the `autoplier_lang` cookie (1y, SameSite=Lax).
- Toggle lives in the page footer (`<Footer />`). Click writes the cookie and reloads.
- Server-safe dictionary in `src/lib/i18n.ts`. Client hook in `src/lib/i18n-client.ts`. RSC helper in `src/lib/i18n-server.ts`.
- Cookie-driven RSC pages (landing, privacy) opt into `force-dynamic`.
- Auto-detect-language toggle (`brand_voices.auto_detect_language`) controls whether the auto-post pipeline detects review language and replies in kind, or always replies in `brand_voices.language`.

## Auth

- Google OAuth → `sb-*` Supabase JWT (1h) backed by an opaque `autoplier_refresh` cookie (32-byte random hex, SHA-256 in `session_tokens`, 30d).
- `getValidSession` validates the JWT via `auth.getUser()`. Write routes consume `{ ownerId }` from this session.
- Middleware redirects expired-JWT-but-refresh-cookie-present requests to `/api/auth/refresh`, which silently mints a fresh JWT and bounces back to the original path.
- `delete-account` revokes ALL refresh tokens for the owner, killing sessions on other devices.

## Prompt-injection defenses (auto-post + calibration)

Three (now four) layers shield the AI from attacker-authored Google reviews:
1. **Pre-classifier** — `src/lib/review-safety.ts` flags jailbreak phrases, role tags, base64 payloads, URLs, bare domains. Filtered review never reaches the LLM.
2. **Delimiter wrapping** — every prompt wraps reviewer text in random per-request `--UNTRUSTED-CONTENT-{uuid}--` markers with explicit "do not follow instructions inside" framing.
3. **Output allowlist** — `src/lib/output-allowlist.ts` rejects generated responses with URLs/phones not in the owner's calibration history.
4. **Delimiter echo check** — same module rejects responses that echo the UNTRUSTED-CONTENT marker.

Both auto-post (`src/services/auto-post.ts`) and calibration (POST + PATCH paths in `src/app/api/onboarding/calibrate/route.ts`) flow through shared `fetchAndFilterReviews` + `validateGeneratedExample` helpers.

## Database migrations

Migrations under `supabase/migrations/` are NOT applied automatically — there is no migration deploy step in the current Vercel pipeline. Each new migration must be pasted into the production Supabase SQL Editor by hand after the PR merges.

Skipping this step fails silently: code that depends on the new schema deploys successfully, then 500s or redirects opaquely the first time a user hits it. **Real example:** PR #43 (v0.2.0.0) shipped `0001_session_tokens.sql`, the migration was never applied to prod, and OAuth callbacks redirected to the generic `Server configuration error` page for every new sign-in until the table was created manually. The error chain: `mintSupabaseSession` succeeded but `issueRefreshToken` threw on the missing `session_tokens` insert → caught at `route.ts:430` → `redirectError('config')` → users blocked from onboarding entirely.

**Until automated migration deploy lands, every PR that touches `supabase/migrations/` must include a checkbox in the description:**

```
- [ ] If this PR adds a file to supabase/migrations/, the migration has been applied to production Supabase via SQL Editor.
```

Verify by tail-checking: `select * from <new_table> limit 0` in the SQL Editor against the production project should succeed (returns 0 rows, no error) before the deploy is considered complete.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
