# Changelog

All notable changes to Autoplier will be documented in this file.

## [0.2.0.0] - 2026-05-02

### Added
- **English/Spanish language toggle.** Site-wide i18n via `autoplier_lang` cookie. Owners switch UI language from a discrete toggle in the page footer (English · Español). Spanish translations use natural Latin-American / US-Spanish register, not literal translations.
- **Auto-detect review language.** Owners can opt into responding in the language of each incoming review (e.g. an English review gets an English reply, a Spanish review gets a Spanish reply). Set during onboarding step 2 or in Settings → Brand voice; persisted in `brand_voices.auto_detect_language`.
- **Refresh-token sessions.** Hourly Supabase JWTs are now backed by an opaque 30-day refresh cookie (`autoplier_refresh`). When the JWT expires, the middleware silently swaps it for a fresh one — owners stay signed in for 30 days without re-OAuth. Refresh tokens are SHA-256 hashed in the DB, revocable per-row, and killed on multi-device logout via `delete-account`.
- **Prompt-injection defenses on the review pipeline.** Three layers protect the AI from attacker-authored Google reviews: (1) classifier filter that drops reviews containing jailbreak phrases, role tags, base64 payloads, URLs, and bare domains; (2) random per-request UNTRUSTED-CONTENT delimiters wrapping reviewer text in every prompt; (3) post-generation allowlist that rejects responses with new URLs, phone numbers, or echoed delimiters before they reach Google. All three layers are wired into both the cron auto-post pipeline and onboarding calibration (POST + PATCH).
- **Site footer on every page.** Centralized `Autoplier · contact@autoplier.com · Privacy` line plus the language toggle, replacing per-page footer drift.
- **`/api/auth/refresh` route** — POST (JSON 200/401) for client-side refresh, GET `?next=<path>` for middleware-redirect flow with same-origin protection.
- **`session_tokens` table** with RLS `using(false)` (service-role only).
- **`brand_voices.auto_detect_language` column** (boolean, default false). Migrations: `supabase/migrations/0001_session_tokens.sql`, `supabase/migrations/0002_auto_detect_language.sql`.
- **Unit test suites** for the three pure-function libs that gate the AI pipeline: `src/lib/review-safety.test.ts` (9), `src/lib/output-allowlist.test.ts` (11 including delimiter-echo checks), `src/lib/i18n.test.ts` (5). Total: 46 tests passing.

### Changed
- **Auth model.** `autoplier_session=ownerId` cookie removed entirely (was a stable, non-rotating identifier — leak-once-and-it's-yours-for-30-days). All write routes now read `ownerId` from the validated `sb-*` JWT via `getValidSession`. Same `{ ownerId } | null` return shape; no caller behavior change.
- **Stripe SDK initialization is now lazy** in `delete-account`, `cancel-subscription`, `stripe/checkout`, and `stripe/webhook`. Previously the constructor ran at module load, which broke `npm run build` whenever `STRIPE_SECRET_KEY` wasn't in the build environment.
- **Calibration prompt** now drives all generated example responses (and sample reviews) in the owner's primary language via an explicit instruction to the model.
- **Generate-response prompt** branches on `auto_detect_language`: detect-and-match when on, "respond in {ownerLanguage}" when off.
- **Error page** maps all 11 OAuth callback reason codes to specific copy (was: 6 codes fell through to a generic "Something went wrong"), and the UNKNOWN variant has a primary "Try again" action plus muted "Contact support" link (was: only Contact support, no recovery path).
- **Calibration code paths** now share `fetchAndFilterReviews` and `validateGeneratedExample` helpers, so any future GBP-fetch-using code path inherits all three injection defenses by construction.

### Fixed
- **Onboarding step 3 rendered blank** when entered directly via deep link, refresh, or browser back/forward. Now auto-triggers calibration so the user always sees a spinner, an error with recovery, or the cards.
- **Pause auto-posting link in Settings** flashed darker on press and used optimistic state. Now server-authoritative; hover scoped behind `@media (hover: hover)`.

### Security
- Closed the prompt-injection vector that allowed reviewer-authored Google review text to potentially manipulate AI-generated responses (3-layer defense, see Added).
- Replaced the stable `autoplier_session=ownerId` cookie with rotating `sb-*` JWTs backed by hashed, server-revocable refresh tokens (see Changed).

## [0.1.0.0] - 2026-04-06

### Added
- Landing page with hero, how-it-works steps, testimonials, and pricing section
- Onboarding wizard: 4-step flow for Google connect, brand voice, calibration, and digest preferences
- Dashboard with status hero, activity feed with stagger-in animations, and auto-reply toggle
- Settings page with location config, brand voice preview, notification toggles, and danger zone
- Global design tokens (CSS custom properties) matching DESIGN.md: Fraunces, Instrument Sans, DM Mono typography, warm parchment palette, 560px max-width
- Dark mode support via `prefers-color-scheme` media query
- Reduced motion support via `prefers-reduced-motion` media query

### Fixed
- Clamped star rating component to prevent crash on out-of-range values
- Moved calibration loading timers into useEffect with cleanup to prevent memory leaks
- Removed `window.matchMedia` from render path to avoid SSR hydration issues
- Fixed dragover CSS class persisting after file drop
