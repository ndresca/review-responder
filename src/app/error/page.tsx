'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LogoFull } from '@/components/LogoFull'
import styles from './error.module.css'

// Reason codes are produced by src/app/api/auth/google/callback/route.ts
// (and any future server-side flow that redirects to /error). Keep this map
// in sync with redirectError() calls in those routes.
type ActionKind =
  | { kind: 'try-again'; href: string; label: string }
  | { kind: 'contact-support'; label: string }

type ErrorVariant = {
  heading: string
  message: string
  primary: ActionKind
  // Whether to also show the muted "Or contact support" link below the
  // primary action. Hidden when the primary IS contact support.
  showSupportFallback: boolean
}

const SUPPORT_MAILTO = 'mailto:contact@autoplier.com'

const TRY_AGAIN_GOOGLE: ActionKind = { kind: 'try-again', href: '/onboarding', label: 'Try again' }

const VARIANTS: Record<string, ErrorVariant> = {
  // Google declined / cancelled — Google's `error` query param is forwarded as
  // `google_${error}`, most commonly `google_access_denied`.
  google_access_denied: {
    heading: 'Connection declined',
    message: 'You declined to connect your Google account. You can try again from the onboarding page.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  token_exchange: {
    heading: 'Connection error',
    message: 'Something went wrong connecting your Google account. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  missing_state: {
    heading: 'Session expired',
    message: 'Your session expired. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  state_mismatch: {
    heading: 'Session expired',
    message: 'Your session expired. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  missing_code: {
    heading: 'Connection error',
    message: 'Google didn\'t return an authorization code. Please try connecting again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  no_access_token: {
    heading: 'Connection error',
    message: 'We couldn\'t complete the Google sign-in. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  no_refresh_token: {
    heading: 'Connection needs a refresh',
    message: 'Google didn\'t return a refresh token. Please disconnect and reconnect, choosing your account again when prompted.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  userinfo_fetch: {
    heading: 'Connection error',
    message: 'We couldn\'t read your Google account info. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  user_creation: {
    heading: 'Save failed',
    message: 'Something went wrong saving your account. Please try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: true,
  },
  rate_limited: {
    heading: 'Too many attempts',
    message: 'Too many attempts. Please wait a minute and try again.',
    primary: TRY_AGAIN_GOOGLE,
    showSupportFallback: false,
  },
  config: {
    heading: 'Configuration error',
    message: 'Server configuration error. Please contact support.',
    primary: { kind: 'contact-support', label: 'Contact support' },
    showSupportFallback: false,
  },
}

const UNKNOWN_VARIANT: ErrorVariant = {
  heading: 'Something went wrong',
  message: 'Something unexpected happened. Try again, or contact support if it keeps failing.',
  primary: TRY_AGAIN_GOOGLE,
  showSupportFallback: true,
}

function ErrorContent() {
  const searchParams = useSearchParams()
  const rawReason = searchParams.get('reason')
  const variant = rawReason && VARIANTS[rawReason] ? VARIANTS[rawReason] : UNKNOWN_VARIANT

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <LogoFull className={styles.logoImg} />
      </header>

      <div className={styles.body}>
        <h1 className={styles.heading}>{variant.heading}</h1>
        <p className={styles.message}>{variant.message}</p>

        <div className={styles.actions}>
          {variant.primary.kind === 'try-again' ? (
            <Link href={variant.primary.href} className={styles.btnPrimary}>
              {variant.primary.label}
            </Link>
          ) : (
            <a href={SUPPORT_MAILTO} className={styles.btnPrimary}>
              {variant.primary.label}
            </a>
          )}
          {/* Contact-support is a small muted text link below the primary —
              available without competing visually with the main action. */}
          {variant.showSupportFallback && (
            <a href={SUPPORT_MAILTO} className={styles.supportLink}>
              Contact support
            </a>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div />}>
      <ErrorContent />
    </Suspense>
  )
}
