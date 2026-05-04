# Post-launch TODO

Deferred work that's intentionally being skipped for the launch push. Each item has the context needed to act on it later without re-deriving why it's here.

## 1. Move autoplier.com from User alias domain to Secondary Domain

*Currently autoplier.com is a User alias domain in Google Workspace, which only allows `<existing-username>@autoplier.com` aliases. Cannot create groups or arbitrary aliases on it. To enable `contact@autoplier.com` (and future `support@`, `hello@`, etc.), remove the User alias domain registration and re-add as a Secondary Domain. Requires DNS verification + Gmail activation. Will temporarily break andres@autoplier.com. After conversion: create `contact@` as a Google Group routing to andres@landofiguanas.com, set up "Send mail as" in Gmail. Then revert PR #60: change footer + privacy + terms back to `contact@autoplier.com`.*

- [ ] Remove `autoplier.com` User alias domain in Google Workspace admin
- [ ] Re-add `autoplier.com` as Secondary Domain; complete DNS + Gmail verification
- [ ] Create `contact@autoplier.com` Google Group routing to andres@landofiguanas.com
- [ ] Set up "Send mail as" in Gmail so replies appear from `contact@autoplier.com`
- [ ] Revert PR #60 — swap `contact@landofiguanas.com` back to `contact@autoplier.com` in `src/components/Footer.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/error/page.tsx`

## 2. Fix /api/onboarding/calibrate when GBP API not approved

*Currently returns 502 "Failed to load Google credentials" when GBP API access is denied/pending. Surfaced during PR #58 verification with the test account. Fix: calibrate route should fall back to placeholder/empty review data when GBP fetch fails, similar to PR #58's locations stub pattern. Don't block onboarding on calibrate failure. Resolves automatically when GBP API access is approved, but fix should land before public launch in case some users have Google accounts without GBP listings.*

- [ ] Mirror PR #58's stub-fallback pattern in `src/app/api/onboarding/calibrate/route.ts` — when GBP fetch fails, return a placeholder set of review samples instead of 502
- [ ] Surface a banner on step 3 when calibration is running on placeholder data ("Sample reviews shown until your Google Business Profile connects")
- [ ] Confirm step 3's accept/reject UI works against placeholder data so users can complete onboarding
- [ ] Verify cron auto-post path doesn't try to post against `pending:*` stub locations

## 3. Investigate Bug B: intermittent /api/settings/load 401s

*Across multiple test sessions, the rehydrate effect's `/api/settings/load` call returns 401 even with valid OAuth + refresh tokens. Logs show `[settings/load] unauthenticated` was firing reliably during diagnosis. Likely cause: session JWT cookies not surviving the language hard-reload, OR cookies being set with wrong SameSite/Secure attributes, OR `mintSupabaseSession` cookie write timing issue. Doesn't break the app since rehydrate fails gracefully. Worth fixing for cleaner UX and to remove the 401 noise from production logs.*

- [ ] Reproduce locally: capture `Set-Cookie` headers from the OAuth callback response and confirm `sb-*-auth-token` is present with the expected attributes (httpOnly, sameSite=lax, secure, path=/)
- [ ] Compare browser cookie jar before/after the language hard-reload to confirm cookies survive
- [ ] If cookies are missing from the request: check if Safari ITP is dropping them (third-party cookie context, partitioned storage, etc.)
- [ ] If cookies are present but invalid: log the JWT payload server-side, check for `iss` / `aud` mismatch with the running Supabase project
- [ ] If `mintSupabaseSession`'s `setSession` is racing the redirect: explicitly await all cookie writes before returning the redirect response

## 4. Remove step 1 "Skip for now" QA bypass

*File: `src/app/onboarding/page.tsx`, around line 813. Marked `// TODO: remove before launch`. Bypasses Google OAuth on step 1 — required for QA testing before OAuth was reliably working. Now obsolete.*

- [ ] Delete the `<button className={styles.skipLink}>` block on step 1 in `src/app/onboarding/page.tsx`
- [ ] Verify nothing else references the skip path (the i18n key `skipForNow` is also used on step 3 calibration and step 5 Stripe — keep those)
- [ ] Same review on step 5 Stripe Skip-for-now button — that one is the QA escape from forced payment; decide whether it stays past launch

## 5. Apply for GBP API access (second attempt)

*First application rejected (Google case 9-8420000041076) on 2026-04-24. Rejection cited internal quality checks; vague reason referenced incomplete Business Profile or website. Pre-reapplication checklist below. Once approved: register GBP scopes in Google Cloud Console Data Access page, then submit OAuth app verification.*

- [ ] Confirm Pink's GBP listing complete: address, hours, photos, description, website link
- [ ] Confirm autoplier.com landing page is fully populated (currently is, post-launch)
- [ ] Draft application narrative emphasizing: SaaS for restaurants, owner self-service, not a reseller, not a data broker
- [ ] Submit GBP API access request via Google Cloud Console
- [ ] After approval: register GBP scopes in Google Cloud Console Data Access page
- [ ] Submit OAuth app verification (separate process from API access)
- [ ] Sync existing `pending:*` stub locations rows to real GBP resource paths once approval lands (touches `supabase` table `locations`, replace `google_location_id` in-place)
