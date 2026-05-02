'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditableResponse from '@/components/EditableResponse'
import { Footer } from '@/components/Footer'
import { useTranslation } from '@/lib/i18n-client'
import type { Translation } from '@/lib/i18n'
import styles from './history.module.css'

// Shape returned by GET /api/history/load.
type HistoryEntry = {
  reviewId: string
  reviewerName: string
  rating: number
  reviewText: string
  reviewCreatedAt: string | null
  responseText: string
  status: string
  postedAt: string | null
}

type HistoryData = {
  locationId: string | null
  locationName: string | null
  entries: HistoryEntry[]
}

// Compact relative-time formatter, mirrors the dashboard helper. Pulls
// number-bearing strings from the active dictionary so plural rules and
// abbreviations vary per language.
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

function statusLabel(status: string): 'posted' | 'needs attention' {
  return status === 'posted' ? 'posted' : 'needs attention'
}

function StarRating({ count }: { count: number }) {
  const clamped = Math.max(0, Math.min(5, count))
  return (
    <span className={styles.stars} aria-label={`${clamped} stars`}>
      {'★'.repeat(clamped)}
      {'☆'.repeat(5 - clamped)}
    </span>
  )
}

export default function HistoryPage() {
  const router = useRouter()
  const { t, lang } = useTranslation()

  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(initial: boolean) {
      try {
        const res = await fetch('/api/history/load')
        if (cancelled) return

        if (res.status === 401) {
          router.push('/onboarding')
          return
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`GET /api/history/load failed: HTTP ${res.status}`, body)
          if (initial) setLoadError(t.histLoadError)
          return
        }

        const payload = (await res.json()) as HistoryData
        if (cancelled) return
        setData(payload)
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        console.error('GET /api/history/load threw:', err)
        if (initial) setLoadError(t.histNetworkError)
      } finally {
        if (!cancelled && initial) setLoading(false)
      }
    }

    load(true)
    const interval = setInterval(() => load(false), 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [router, t.histLoadError, t.histNetworkError])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          {t.histBackToDashboard}
        </Link>
      </header>

      <h1 className={styles.title}>{t.histTitle}</h1>
      <p className={styles.refreshLabel}>{t.histRefreshLabel}</p>

      {loading && (
        <div className={styles.loadingWrap} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>{t.histLoadingText}</span>
        </div>
      )}

      {!loading && loadError && (
        <p className={styles.errorNotice} role="alert">{loadError}</p>
      )}

      {!loading && !loadError && data && data.entries.length === 0 && (
        <p className={styles.emptyNotice}>{t.histEmpty}</p>
      )}

      {!loading && !loadError && data && data.entries.length > 0 && (
        <div className={styles.list}>
          {data.entries.map((entry) => {
            const label = statusLabel(entry.status)
            const time = timeAgo(entry.postedAt ?? entry.reviewCreatedAt, t, lang)
            return (
              <article key={entry.reviewId} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIdentity}>
                    <StarRating count={entry.rating} />
                    <div>
                      <span className={styles.cardReviewer}>{entry.reviewerName || t.histAnonymous}</span>
                      {data.locationName && (
                        <span className={styles.cardLocation}>{data.locationName}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span
                      className={`${styles.badge} ${
                        label === 'posted' ? styles.badgePosted : styles.badgeAttention
                      }`}
                    >
                      {label === 'posted' ? t.histPosted : t.histNeedsAttention}
                    </span>
                    <time className={styles.cardTime} dateTime={entry.postedAt ?? entry.reviewCreatedAt ?? ''}>
                      {time}
                    </time>
                  </div>
                </div>
                <p className={styles.cardText}>{entry.reviewText}</p>
                <EditableResponse response={entry.responseText} tagLabel={t.histAiResponse} />
              </article>
            )
          })}
        </div>
      )}
      <Footer />
    </main>
  )
}
