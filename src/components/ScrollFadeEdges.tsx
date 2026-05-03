'use client'

import { useEffect, useState } from 'react'
import styles from './ScrollFadeEdges.module.css'

// Soft top + bottom edge fades. At rest (scrollY === 0): only the bottom
// fade is visible, hinting at content below. Once scrollY > 80, the
// bottom fade hides and a top fade appears, hinting at content above.
// Both layers are pointer-events:none and aria-hidden so they never
// affect clicks or assistive tech.

const SCROLL_THRESHOLD = 80

export function ScrollFadeEdges() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div
        aria-hidden="true"
        className={`${styles.fade} ${styles.top} ${scrolled ? styles.visible : ''}`}
      />
      <div
        aria-hidden="true"
        className={`${styles.fade} ${styles.bottom} ${scrolled ? '' : styles.visible}`}
      />
    </>
  )
}
