'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditableResponse from '@/components/EditableResponse'
import { LogoFull } from '@/components/LogoFull'
import { Footer } from '@/components/Footer'
import { useTranslation } from '@/lib/i18n-client'
import type { Translation } from '@/lib/i18n'
import styles from './dashboard.module.css'

type RecentResponse = {
  reviewId: string
  reviewerName: string
  rating: number
  reviewText: string
  responseText: string
  status: string
  postedAt: string | null
}

type SubscriptionState = {
  status: string
  trialEndsAt: string | null
}

type DashboardData = {
  locationId: string | null
  locationName: string | null
  autoPostEnabled: boolean
  weeklyPostedCount: number
  recentResponses: RecentResponse[]
  subscription: SubscriptionState | null
}

function timeAgo(iso: string | null, t: Translation, lang: 'en' | 'es'): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return t.timeJustNow
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return t.timeMinutesAgo(minutes)
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) return t.timeHoursAgo(hours)
  const days = Math.floor(ms / 86_400_000)
  if (days === 1) return t.timeYesterday
  if (days < 7) return t.timeDaysAgo(days)
  const locale = lang === 'es' ? 'es-US' : 'en-US'
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function StarRating({ count }: { count: number }) {
  const clamped = Math.max(0, Math.min(5, count))
  return (
    <span className={styles.cardStars} aria-label={`${clamped} stars`}>
      {'★'.repeat(clamped)}{'☆'.repeat(5 - clamped)}
    </span>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { t, lang } = useTranslation()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [toggling, setToggling] = useState(false)
  const [prefersReduced, setPrefersReduced] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPrefersReduced(reduced)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/dashboard/load')
        if (cancelled) return

        if (res.status === 401) {
          // Edge middleware accepted the cookie because it's present; the
          // API route validated the JWT and rejected it as expired or
          // invalid. Hand off to /api/auth/refresh which trades the
          // long-lived autoplier_refresh cookie for a fresh sb-* JWT and
          // bounces back to /dashboard. If refresh itself fails, that
          // route redirects to /onboarding for re-OAuth.
          router.push('/api/auth/refresh?next=/dashboard')
          return
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`GET /api/dashboard/load failed: HTTP ${res.status}`, body)
          setLoadError(t.dashLoadError)
          return
        }

        const payload = (await res.json()) as DashboardData
        if (cancelled) return
        setData(payload)
      } catch (err) {
        if (cancelled) return
        console.error('GET /api/dashboard/load threw:', err)
        setLoadError(t.dashNetworkError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [router, t.dashLoadError, t.dashNetworkError])

  useEffect(() => {
    if (!data || prefersReduced) return
    setVisibleCards(new Set())
    const timers = data.recentResponses.map((_, i) =>
      setTimeout(() => {
        setVisibleCards((prev) => new Set(prev).add(i))
      }, 80 + i * 150),
    )
    return () => timers.forEach(clearTimeout)
  }, [data, prefersReduced])

  async function handleToggleAutoPost() {
    if (toggling || !data) return
    const previous = data.autoPostEnabled
    setData({ ...data, autoPostEnabled: !previous })
    setToggling(true)

    try {
      const res = await fetch('/api/settings/toggle-auto-post', { method: 'POST' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/toggle-auto-post failed: HTTP ${res.status}`, body)
        setData({ ...data, autoPostEnabled: previous })
        return
      }
      const json = (await res.json()) as { autoPostEnabled: boolean }
      setData(d => d ? { ...d, autoPostEnabled: json.autoPostEnabled } : d)
    } catch (err) {
      console.error('POST /api/settings/toggle-auto-post threw:', err)
      setData(d => d ? { ...d, autoPostEnabled: previous } : d)
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <LogoFull className={styles.logoImg} />
          <Link href="/settings" className={styles.settingsLink}>{t.dashSettingsLink}</Link>
        </header>
        <section className={styles.statusHero} aria-label="Loading">
          <div className={styles.skeletonStatusRow} aria-hidden="true" />
          <div className={styles.skeletonHeadline} aria-hidden="true" />
          <div className={styles.skeletonSub} aria-hidden="true" />
        </section>
        <section className={styles.feed} aria-label={t.dashRecentResponses}>
          <div className={styles.feedLabel} aria-hidden="true">{t.dashRecentResponses}</div>
          {[0, 1, 2].map(i => (
            <div key={i} className={styles.skeletonCard} aria-hidden="true">
              <div className={styles.skeletonLine} style={{ width: '40%' }} />
              <div className={styles.skeletonLine} style={{ width: '90%' }} />
              <div className={styles.skeletonLine} style={{ width: '75%' }} />
            </div>
          ))}
        </section>
        <Footer />
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <LogoFull className={styles.logoImg} />
          <Link href="/settings" className={styles.settingsLink}>{t.dashSettingsLink}</Link>
        </header>
        <section className={styles.statusHero}>
          <p className={styles.weeklyCount}>{loadError ?? ''}</p>
        </section>
        <Footer />
      </main>
    )
  }

  const active = data.autoPostEnabled
  const subStatus = data.subscription?.status
  const showTrialBanner = subStatus !== 'active' && subStatus !== 'trialing'

  return (
    <main className={styles.page}>
      {/* Nav */}
      <header className={styles.pageHeader}>
        <LogoFull className={styles.logoImg} />
        <Link href="/settings" className={styles.settingsLink}>{t.dashSettingsLink}</Link>
      </header>

      {/* Trial banner — shown for users with no active/trialing Stripe
          subscription (e.g. reached /dashboard via Skip-for-now on step 5,
          or trial expired without payment). Routes back to step 5 to add
          a payment method. Stacks above the auto-post status — adding
          payment is more urgent than the auto-post toggle since it gates
          the whole feature post-trial. */}
      {showTrialBanner && (
        <div className={styles.trialBannerSlot}>
          <div className={styles.trialBanner}>
            {t.dashTrialBannerText}
            <button
              type="button"
              className={styles.trialBannerCta}
              onClick={() => router.push('/onboarding?step=5')}
            >
              {t.dashTrialBannerCta}
            </button>
          </div>
        </div>
      )}

      {/* Status hero */}
      <section className={styles.statusHero} aria-label="Automation status" data-i18n-anchor="dashboard-status">
        <div className={styles.statusRow} role="status" aria-live="polite">
          <span
            className={styles.statusDot}
            style={{ background: active ? 'var(--success)' : 'var(--error)' }}
            aria-hidden="true"
          />
          <span
            className={styles.statusDotLabel}
            style={{ color: active ? 'var(--success)' : 'var(--error)' }}
          >
            {active ? t.dashStatusOn : t.dashStatusPaused}
          </span>
        </div>

        <h1 className={styles.headline}>
          {active ? t.dashHeadlineOn : t.dashHeadlinePaused}
        </h1>

        <p className={styles.weeklyCount}>
          {t.dashWeeklySent(data.weeklyPostedCount)}
          <span className={styles.middot}>·</span>
          <Link href="/history" aria-label="View response history">{t.dashSeeHistory}</Link>
        </p>
      </section>

      {/* Activity feed */}
      <section className={styles.feed} aria-label={t.dashRecentResponses} data-i18n-anchor="dashboard-feed">
        <div className={styles.feedLabel} aria-hidden="true">{t.dashRecentResponses}</div>

        {data.recentResponses.length === 0 ? (
          <p className={styles.emptyFeed}>{t.dashEmptyFeed}</p>
        ) : data.recentResponses.map((r, i) => (
          <article
            key={r.reviewId}
            className={`${styles.card} ${prefersReduced ? styles.noMotion : ''} ${visibleCards.has(i) ? styles.visible : ''}`}
          >
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.cardReviewer}>{r.reviewerName || t.dashAnonymous}</span>
                {data.locationName && (
                  <span className={styles.cardLocation}>{data.locationName}</span>
                )}
              </div>
              <div className={styles.cardMeta}>
                <StarRating count={r.rating} />
                <time className={styles.cardTime} dateTime={r.postedAt ?? ''}>
                  {timeAgo(r.postedAt, t, lang)}
                </time>
              </div>
            </div>
            <p className={styles.cardReviewText}>{r.reviewText}</p>
            <EditableResponse response={r.responseText} tagLabel={t.editableResponseSent} />
          </article>
        ))}
      </section>

      {/* Replies pill button */}
      <footer className={styles.pageFooter}>
        <button
          className={styles.repliesBtn}
          data-active={active ? 'true' : 'false'}
          aria-pressed={active}
          aria-label={active ? t.dashAutoRepliesAriaOn : t.dashAutoRepliesAriaPaused}
          onClick={handleToggleAutoPost}
          disabled={toggling}
        >
          <span className={styles.repliesBtnDot} aria-hidden="true" />
          <span>{active ? t.dashAutoRepliesOn : t.dashAutoRepliesPaused}</span>
        </button>
      </footer>
      <Footer />
    </main>
  )
}
