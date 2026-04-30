'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditableResponse from '@/components/EditableResponse'
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

// Compact relative-time formatter, mirrors the dashboard helper.
function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'Just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(ms / 86_400_000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Maps responses_posted.status to the two-state UI label. Anything that's
// not 'posted' is "needs attention" — covers failed, blocked_pending_regen,
// and retrying.
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

  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Initial load + 60s polling so the page reflects new responses without
  // a manual refresh. Same pattern the previous mock implementation used,
  // now with a real fetch.
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
          if (initial) setLoadError("We couldn't load your review history. Try refreshing.")
          return
        }

        const payload = (await res.json()) as HistoryData
        if (cancelled) return
        setData(payload)
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        console.error('GET /api/history/load threw:', err)
        if (initial) setLoadError('Network error — check your connection and try again.')
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
  }, [router])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          ← Dashboard
        </Link>
      </header>

      <h1 className={styles.title}>Review history.</h1>
      <p className={styles.refreshLabel}>Updates every 60 seconds.</p>

      {loading && (
        <div className={styles.loadingWrap} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading your history...</span>
        </div>
      )}

      {!loading && loadError && (
        <p className={styles.errorNotice} role="alert">{loadError}</p>
      )}

      {!loading && !loadError && data && data.entries.length === 0 && (
        <p className={styles.emptyNotice}>
          No responses yet. New reviews and replies will appear here within 15 minutes of being posted.
        </p>
      )}

      {!loading && !loadError && data && data.entries.length > 0 && (
        <div className={styles.list}>
          {data.entries.map((entry) => {
            const label = statusLabel(entry.status)
            const time = timeAgo(entry.postedAt ?? entry.reviewCreatedAt)
            return (
              <article key={entry.reviewId} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIdentity}>
                    <StarRating count={entry.rating} />
                    <div>
                      <span className={styles.cardReviewer}>{entry.reviewerName || 'Anonymous'}</span>
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
                      {label === 'posted' ? 'Posted' : 'Needs attention'}
                    </span>
                    <time className={styles.cardTime} dateTime={entry.postedAt ?? entry.reviewCreatedAt ?? ''}>
                      {time}
                    </time>
                  </div>
                </div>
                <p className={styles.cardText}>{entry.reviewText}</p>
                <EditableResponse response={entry.responseText} tagLabel="AI response" />
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
