'use client'

import { useEffect, useState } from 'react'
import styles from './ScrollFadeEdges.module.css'

// Soft top + bottom edge fades.
//   Bottom fade: persists the entire scroll journey, only hiding once the
//     user is within 10px of the document bottom. The point is to keep
//     hinting "more below" continuously while reading.
//   Top fade: hidden at the very top, appears once scrollY > 80, stays
//     until the user scrolls back to the top.
// Both layers are pointer-events:none and aria-hidden so they never affect
// clicks or assistive tech.

const TOP_THRESHOLD = 80
const BOTTOM_EPSILON = 10

export function ScrollFadeEdges() {
  const [topVisible, setTopVisible] = useState(false)
  const [bottomVisible, setBottomVisible] = useState(true)

  useEffect(() => {
    const update = () => {
      const y = window.scrollY
      const reachedBottom =
        y + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_EPSILON
      setTopVisible(y > TOP_THRESHOLD)
      setBottomVisible(!reachedBottom)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <>
      <div
        aria-hidden="true"
        className={`${styles.fade} ${styles.top} ${topVisible ? styles.visible : ''}`}
      />
      <div
        aria-hidden="true"
        className={`${styles.fade} ${styles.bottom} ${bottomVisible ? styles.visible : ''}`}
      />
    </>
  )
}
