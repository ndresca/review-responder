'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LogoFull } from '@/components/LogoFull'
import { Footer } from '@/components/Footer'
import { useTranslation } from '@/lib/i18n-client'
import type { Translation } from '@/lib/i18n'
import styles from './error.module.css'

// Reason codes are produced by src/app/api/auth/google/callback/route.ts
// (and any future server-side flow that redirects to /error). Keep this map
// in sync with redirectError() calls in those routes. Each entry is keyed by
// the reason and pulls heading/body from the active translation dictionary.

type ActionKind =
  | { kind: 'try-again'; href: string; label: string }
  | { kind: 'contact-support'; label: string }

type ErrorVariant = {
  heading: string
  message: string
  primary: ActionKind
  showSupportFallback: boolean
}

const SUPPORT_MAILTO = 'mailto:contact@autoplier.com'

function buildVariants(t: Translation): { variants: Record<string, ErrorVariant>; unknown: ErrorVariant } {
  const tryAgainGoogle: ActionKind = { kind: 'try-again', href: '/onboarding', label: t.errTryAgain }
  const contactSupport: ActionKind = { kind: 'contact-support', label: t.errContactSupport }

  const variants: Record<string, ErrorVariant> = {
    google_access_denied: { heading: t.errGoogleAccessDeniedHead, message: t.errGoogleAccessDeniedBody, primary: tryAgainGoogle, showSupportFallback: true },
    token_exchange:       { heading: t.errTokenExchangeHead,       message: t.errTokenExchangeBody,       primary: tryAgainGoogle, showSupportFallback: true },
    missing_state:        { heading: t.errSessionExpiredHead,      message: t.errSessionExpiredBody,      primary: tryAgainGoogle, showSupportFallback: true },
    state_mismatch:       { heading: t.errSessionExpiredHead,      message: t.errSessionExpiredBody,      primary: tryAgainGoogle, showSupportFallback: true },
    missing_code:         { heading: t.errMissingCodeHead,         message: t.errMissingCodeBody,         primary: tryAgainGoogle, showSupportFallback: true },
    no_access_token:      { heading: t.errNoAccessTokenHead,       message: t.errNoAccessTokenBody,       primary: tryAgainGoogle, showSupportFallback: true },
    no_refresh_token:     { heading: t.errNoRefreshTokenHead,      message: t.errNoRefreshTokenBody,      primary: tryAgainGoogle, showSupportFallback: true },
    userinfo_fetch:       { heading: t.errUserinfoFetchHead,       message: t.errUserinfoFetchBody,       primary: tryAgainGoogle, showSupportFallback: true },
    user_creation:        { heading: t.errUserCreationHead,        message: t.errUserCreationBody,        primary: tryAgainGoogle, showSupportFallback: true },
    rate_limited:         { heading: t.errRateLimitedHead,         message: t.errRateLimitedBody,         primary: tryAgainGoogle, showSupportFallback: false },
    config:               { heading: t.errConfigHead,              message: t.errConfigBody,              primary: contactSupport, showSupportFallback: false },
  }

  const unknown: ErrorVariant = {
    heading: t.errUnknownHead,
    message: t.errUnknownBody,
    primary: tryAgainGoogle,
    showSupportFallback: true,
  }

  return { variants, unknown }
}

function ErrorContent() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const rawReason = searchParams.get('reason')
  const { variants, unknown } = buildVariants(t)
  const variant = rawReason && variants[rawReason] ? variants[rawReason] : unknown

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
            <a href={SUPPORT_MAILTO} className={styles.supportLink}>
              {t.errContactSupport}
            </a>
          )}
        </div>
      </div>
      <Footer />
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
