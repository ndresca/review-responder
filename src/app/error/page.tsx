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

const VARIANTS: Record<string, ErrorVariant> = {
  google_denied: {
    heading: 'Connection declined',
    message: 'You declined to connect your Google account. You can try again from the onboarding page.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  token_exchange: {
    heading: 'Connection error',
    message: 'Something went wrong connecting your Google account. Please try again.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  missing_state: {
    heading: 'Session expired',
    message: 'Your session expired. Please try again.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  state_mismatch: {
    heading: 'Session expired',
    message: 'Your session expired. Please try again.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  no_gbp_accounts: {
    heading: 'No business profile found',
    message: "No Google Business Profile found on this account. Make sure you're signed in with the correct Google account.",
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  no_gbp_locations: {
    heading: 'No business profile found',
    message: "No Google Business Profile found on this account. Make sure you're signed in with the correct Google account.",
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
  },
  rate_limited: {
    heading: 'Too many attempts',
    message: 'Too many attempts. Please wait a minute and try again.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: false,
  },
  db_write: {
    heading: 'Save failed',
    message: 'Something went wrong saving your account. Please try again.',
    primary: { kind: 'try-again', href: '/onboarding', label: 'Try again' },
    showSupportFallback: true,
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
  message: 'Something went wrong. Please try again or contact support at contact@autoplier.com.',
  primary: { kind: 'contact-support', label: 'Contact support' },
  showSupportFallback: false,
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
          {variant.showSupportFallback && (
            <a href={SUPPORT_MAILTO} className={styles.secondaryLink}>
              Or contact support
            </a>
          )}
        </div>

        {/* Tiny mono code for our own debugging if a user forwards a screenshot.
            Only shown when there's a real reason in the URL — generic unknown
            renders cleanly without it. */}
        {rawReason && (
          <p className={styles.reasonCode}>{rawReason}</p>
        )}
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
