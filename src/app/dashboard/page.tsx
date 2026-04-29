'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditableResponse from '@/components/EditableResponse'
import { LogoFull } from '@/components/LogoFull'
import styles from './dashboard.module.css'

// Dashboard load shape from GET /api/dashboard/load. Kept inline here rather
// than in lib/types so the API and page can evolve together.
type RecentResponse = {
  reviewId: string
  reviewerName: string
  rating: number
  reviewText: string
  responseText: string
  status: string
  postedAt: string | null
}

type DashboardData = {
  locationId: string | null
  locationName: string | null
  autoPostEnabled: boolean
  weeklyPostedCount: number
  recentResponses: RecentResponse[]
}

// Compact relative-time formatter. Built for "minutes-to-weeks" recency —
// older items fall back to a short month/day. Uses local time; the postedAt
// timestamp is UTC, JS handles the offset.
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

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Auto-post toggle — driven by data.autoPostEnabled once loaded; flipped
  // optimistically on click and reconciled with the server's response.
  const [toggling, setToggling] = useState(false)

  // Stagger-in animation state, identical to the previous mock implementation.
  const [prefersReduced, setPrefersReduced] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPrefersReduced(reduced)
  }, [])

  // Initial load. Middleware redirects unauthenticated users at /dashboard
  // to /onboarding before we mount, so a 401 here means the cookie is set
  // but the user was deleted server-side — rare but possible. We mirror the
  // middleware redirect so the user lands somewhere sensible.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/dashboard/load')
        if (cancelled) return

        if (res.status === 401) {
          router.push('/onboarding')
          return
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`GET /api/dashboard/load failed: HTTP ${res.status}`, body)
          setLoadError("We couldn't load your dashboard. Try refreshing.")
          return
        }

        const payload = (await res.json()) as DashboardData
        if (cancelled) return
        setData(payload)
      } catch (err) {
        if (cancelled) return
        console.error('GET /api/dashboard/load threw:', err)
        setLoadError('Network error — check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [router])

  // Stagger-in only after data is loaded, matched to actual card count.
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

    // Optimistic flip — rollback on failure so the pill always reflects
    // the server's actual state.
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

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <LogoFull className={styles.logoImg} />
          <Link href="/settings" className={styles.settingsLink}>Settings</Link>
        </header>
        <section className={styles.statusHero} aria-label="Loading">
          <div className={styles.skeletonStatusRow} aria-hidden="true" />
          <div className={styles.skeletonHeadline} aria-hidden="true" />
          <div className={styles.skeletonSub} aria-hidden="true" />
        </section>
        <section className={styles.feed} aria-label="Loading recent responses">
          <div className={styles.feedLabel} aria-hidden="true">Recent responses</div>
          {[0, 1, 2].map(i => (
            <div key={i} className={styles.skeletonCard} aria-hidden="true">
              <div className={styles.skeletonLine} style={{ width: '40%' }} />
              <div className={styles.skeletonLine} style={{ width: '90%' }} />
              <div className={styles.skeletonLine} style={{ width: '75%' }} />
            </div>
          ))}
        </section>
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <LogoFull className={styles.logoImg} />
          <Link href="/settings" className={styles.settingsLink}>Settings</Link>
        </header>
        <section className={styles.statusHero}>
          <p className={styles.weeklyCount}>{loadError ?? 'No data'}</p>
        </section>
      </main>
    )
  }

  const active = data.autoPostEnabled

  return (
    <main className={styles.page}>
      {/* Nav */}
      <header className={styles.pageHeader}>
        <LogoFull className={styles.logoImg} />
        <Link href="/settings" className={styles.settingsLink}>Settings</Link>
      </header>

      {/* Status hero */}
      <section className={styles.statusHero} aria-label="Automation status">
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
            {active ? 'All systems running' : 'Auto-replies paused'}
          </span>
        </div>

        <h1 className={styles.headline}>
          {active ? 'Your reviews are handled.' : 'Your reviews are waiting.'}
        </h1>

        <p className={styles.weeklyCount}>
          {data.weeklyPostedCount} {data.weeklyPostedCount === 1 ? 'response' : 'responses'} sent this week
          <span className={styles.middot}>·</span>
          <Link href="/history" aria-label="View response history">see full history →</Link>
        </p>
      </section>

      {/* Activity feed */}
      <section className={styles.feed} aria-label="Recent responses">
        <div className={styles.feedLabel} aria-hidden="true">Recent responses</div>

        {data.recentResponses.length === 0 ? (
          <p className={styles.emptyFeed}>
            No responses yet. New reviews will appear here within 15 minutes of being posted.
          </p>
        ) : data.recentResponses.map((r, i) => (
          <article
            key={r.reviewId}
            className={`${styles.card} ${prefersReduced ? styles.noMotion : ''} ${visibleCards.has(i) ? styles.visible : ''}`}
          >
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.cardReviewer}>{r.reviewerName || 'Anonymous'}</span>
                {data.locationName && (
                  <span className={styles.cardLocation}>{data.locationName}</span>
                )}
              </div>
              <div className={styles.cardMeta}>
                <StarRating count={r.rating} />
                <time className={styles.cardTime} dateTime={r.postedAt ?? ''}>
                  {timeAgo(r.postedAt)}
                </time>
              </div>
            </div>
            <p className={styles.cardReviewText}>{r.reviewText}</p>
            <EditableResponse response={r.responseText} tagLabel="Response sent" />
          </article>
        ))}
      </section>

      {/* Replies pill button */}
      <footer className={styles.pageFooter}>
        <button
          className={styles.repliesBtn}
          data-active={active ? 'true' : 'false'}
          aria-pressed={active}
          aria-label={active ? 'Auto-replies are on. Click to pause.' : 'Auto-replies are paused. Click to resume.'}
          onClick={handleToggleAutoPost}
          disabled={toggling}
        >
          <span className={styles.repliesBtnDot} aria-hidden="true" />
          <span>{active ? 'Auto-replies ON' : 'Auto-replies PAUSED'}</span>
        </button>
      </footer>
    </main>
  )
}
