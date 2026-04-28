'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import EditableResponse from '@/components/EditableResponse'
import { LogoFull } from '@/components/LogoFull'
import styles from './dashboard.module.css'

const REVIEWS = [
  {
    reviewer: 'Marco Testa',
    location: 'Cafe Luna · Downtown',
    stars: 5,
    time: '2h ago',
    datetime: '2026-04-05T10:14:00',
    reviewText:
      '"Incredible carbonara. We\'ll definitely be back — the service was warm and attentive."',
    response:
      'Thank you so much, Marco! We\'re thrilled the carbonara hit the spot — it\'s one of our favourites too. We look forward to welcoming you back soon.',
  },
  {
    reviewer: 'Priya Mehta',
    location: 'Cafe Luna · Midtown',
    stars: 4,
    time: 'Yesterday',
    datetime: '2026-04-04T19:30:00',
    reviewText:
      '"Loved the risotto and the ambiance. The wait was a bit long but worth every minute."',
    response:
      'Thank you, Priya! We\'re so glad you enjoyed the risotto and the atmosphere. We hear you on the wait — we\'re working on it. Hope to see you again soon.',
  },
  {
    reviewer: 'James Kirkwood',
    location: 'Cafe Luna · Downtown',
    stars: 5,
    time: '2 days ago',
    datetime: '2026-04-03T13:05:00',
    reviewText: '"Best tiramisu in the city, full stop."',
    response:
      'That might be the kindest thing anyone\'s said about our tiramisu! Thank you, James — see you next time.',
  },
]

function StarRating({ count }: { count: number }) {
  const clamped = Math.max(0, Math.min(5, count))
  return (
    <span className={styles.cardStars} aria-label={`${clamped} stars`}>
      {'★'.repeat(clamped)}{'☆'.repeat(5 - clamped)}
    </span>
  )
}

export default function DashboardPage() {
  const [active, setActive] = useState(true)
  const [prefersReduced, setPrefersReduced] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPrefersReduced(reduced)
    if (reduced) return

    const timers = REVIEWS.map((_, i) =>
      setTimeout(() => {
        setVisibleCards((prev) => new Set(prev).add(i))
      }, 80 + i * 150)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <main className={styles.page} >
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
          3 responses sent this week<span className={styles.middot}>·</span>
          <Link href="/history" aria-label="View response history">see full history →</Link>
        </p>
      </section>

      {/* Activity feed */}
      <section className={styles.feed} aria-label="Recent responses">
        <div className={styles.feedLabel} aria-hidden="true">Recent responses</div>

        {REVIEWS.map((review, i) => (
          <article
            key={review.reviewer}
            className={`${styles.card} ${prefersReduced ? styles.noMotion : ''} ${visibleCards.has(i) ? styles.visible : ''}`}
          >
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.cardReviewer}>{review.reviewer}</span>
                <span className={styles.cardLocation}>{review.location}</span>
              </div>
              <div className={styles.cardMeta}>
                <StarRating count={review.stars} />
                <time className={styles.cardTime} dateTime={review.datetime}>
                  {review.time}
                </time>
              </div>
            </div>
            <p className={styles.cardReviewText}>{review.reviewText}</p>
            <EditableResponse response={review.response} tagLabel="Response sent" />
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
          onClick={() => setActive(!active)}
        >
          <span className={styles.repliesBtnDot} aria-hidden="true" />
          <span>{active ? 'Auto-replies ON' : 'Auto-replies PAUSED'}</span>
        </button>
      </footer>
    </main>
  )
}
