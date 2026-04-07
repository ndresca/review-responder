'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import EditableResponse from '@/components/EditableResponse'
import styles from './history.module.css'

interface ReviewEntry {
  id: string
  reviewer: string
  stars: number
  datetime: string
  time: string
  reviewText: string
  response: string
  status: 'posted' | 'needs attention'
}

const MOCK_REVIEWS: ReviewEntry[] = [
  {
    id: '1',
    reviewer: 'Marco Testa',
    stars: 5,
    datetime: '2026-04-07T10:14:00',
    time: '2h ago',
    reviewText:
      '"Incredible carbonara. We\'ll definitely be back — the service was warm and attentive throughout."',
    response:
      'Thank you so much, Marco! We\'re thrilled the carbonara hit the spot — it\'s one of our favourites too. We look forward to welcoming you back soon.',
    status: 'posted',
  },
  {
    id: '2',
    reviewer: 'Priya Mehta',
    stars: 4,
    datetime: '2026-04-06T19:30:00',
    time: 'Yesterday',
    reviewText:
      '"Loved the risotto and the ambiance. The wait was a bit long but worth every minute."',
    response:
      'Thank you, Priya! We\'re so glad you enjoyed the risotto and the atmosphere. We hear you on the wait — we\'re working on it. Hope to see you again soon.',
    status: 'posted',
  },
  {
    id: '3',
    reviewer: 'James Kirkwood',
    stars: 5,
    datetime: '2026-04-05T13:05:00',
    time: '2 days ago',
    reviewText: '"Best tiramisu in the city, full stop."',
    response:
      'That might be the kindest thing anyone\'s said about our tiramisu! Thank you, James — see you next time.',
    status: 'posted',
  },
  {
    id: '4',
    reviewer: 'Sophie Laurent',
    stars: 2,
    datetime: '2026-04-04T21:45:00',
    time: '3 days ago',
    reviewText:
      '"Waited over an hour for our mains. The pasta was cold when it arrived and the server didn\'t seem to care. Really disappointing for the price."',
    response:
      'We\'re truly sorry about your experience, Sophie. That\'s not the standard we hold ourselves to. We\'ve spoken with our team about this directly. If you\'d be open to it, we\'d love the chance to make it right.',
    status: 'needs attention',
  },
  {
    id: '5',
    reviewer: 'David Chen',
    stars: 5,
    datetime: '2026-04-03T12:20:00',
    time: '4 days ago',
    reviewText:
      '"Came for a birthday lunch and the team went above and beyond. Free dessert, a handwritten note, and genuinely warm service. Will be our go-to from now on."',
    response:
      'Happy belated birthday, David! Making those moments special is what we love most. Can\'t wait to celebrate with you again.',
    status: 'posted',
  },
  {
    id: '6',
    reviewer: 'Emma Rossi',
    stars: 3,
    datetime: '2026-04-02T18:10:00',
    time: '5 days ago',
    reviewText:
      '"The food is solid — good flavors, generous portions. But the music was way too loud and the lighting felt more like a nightclub than a restaurant. Hard to have a conversation."',
    response:
      'Thanks for the honest feedback, Emma. We\'re glad the food landed well! The music and lighting are something we\'re actively reviewing. We hope to see you again.',
    status: 'posted',
  },
  {
    id: '7',
    reviewer: 'Alex Petrov',
    stars: 1,
    datetime: '2026-04-01T20:30:00',
    time: '6 days ago',
    reviewText:
      '"Found a hair in my soup. When I told the waiter, he shrugged and offered to bring another bowl. No apology, no discount. Won\'t be returning."',
    response:
      'We\'re deeply sorry, Alex. That\'s completely unacceptable and we\'ve addressed it with our staff. Please reach out to us directly — we\'d like to make this right.',
    status: 'needs attention',
  },
  {
    id: '8',
    reviewer: 'Rachel Kim',
    stars: 4,
    datetime: '2026-03-31T14:00:00',
    time: '1 week ago',
    reviewText:
      '"Great brunch spot. The eggs benedict were perfectly poached and the coffee was excellent. Only knock is the seating is a bit cramped."',
    response:
      'Thank you, Rachel! The eggs benedict are a point of pride for our chef. We hear you on the seating — we\'re exploring some layout changes. See you at brunch!',
    status: 'posted',
  },
]

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
  const [reviews, setReviews] = useState<ReviewEntry[]>(MOCK_REVIEWS)

  useEffect(() => {
    const interval = setInterval(() => {
      setReviews([...MOCK_REVIEWS])
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          ← Dashboard
        </Link>
      </header>

      <h1 className={styles.title}>Review history.</h1>
      <p className={styles.refreshLabel}>Updates every 60 seconds.</p>

      <div className={styles.list}>
        {reviews.map((review) => (
          <article key={review.id} className={styles.card}>
            <div className={styles.cardTop}>
              <div className={styles.cardIdentity}>
                <StarRating count={review.stars} />
                <span className={styles.cardReviewer}>{review.reviewer}</span>
              </div>
              <div className={styles.cardMeta}>
                <span
                  className={`${styles.badge} ${
                    review.status === 'posted'
                      ? styles.badgePosted
                      : styles.badgeAttention
                  }`}
                >
                  {review.status === 'posted' ? 'Posted' : 'Needs attention'}
                </span>
                <time className={styles.cardTime} dateTime={review.datetime}>
                  {review.time}
                </time>
              </div>
            </div>
            <p className={styles.cardText}>{review.reviewText}</p>
            <EditableResponse response={review.response} tagLabel="AI response" />
          </article>
        ))}
      </div>
    </main>
  )
}
