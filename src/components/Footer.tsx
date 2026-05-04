'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import {
  SCROLL_ANCHOR_ID_KEY,
  SCROLL_ANCHOR_OFFSET_KEY,
  SCROLL_RATIO_KEY,
  SCROLL_RESTORE_KEY,
  setLanguage,
  useTranslation,
} from '@/lib/i18n-client'
import type { Lang } from '@/lib/i18n'
import styles from './footer.module.css'

// Shared site footer. Two rows:
//   1. Language switch (English · Español) — discrete, near-black at ~40% /
//      ~80% opacity for inactive / active. No borders, no background.
//   2. Brand line — "Autoplier · contact@landofiguanas.com · Privacy · Terms".
//
// Client component on purpose: useTranslation reads the cookie via
// document.cookie + useEffect. Brief flash to default language is
// acceptable here because the footer sits below the fold on most
// pages — the hydration delta is invisible during normal scrolling.

export function Footer() {
  const { t, lang } = useTranslation()

  // Restore scroll after a language-switch hard-reload. setLanguage seeds
  // anchor + ratio + pixel keys before reloading; this effect runs on
  // the fresh mount and re-positions the user.
  //
  // Strategy in priority order:
  //   1. Anchor-based: find the same DOM element that was at the top of
  //      the viewport pre-reload, scroll so it sits at the same offset.
  //      Robust to text reflow when ES copy is longer/shorter than EN.
  //   2. Ratio-based: same proportional position in the document.
  //      Used only when no anchor was visible (e.g. all-fixed pages).
  //   3. Pixel fallback: original scrollY. Last resort, will drift on
  //      reflow but better than landing at the top.
  //
  // Timing: gate on document.fonts.ready so layout has committed at
  // post-font heights (Fraunces, Instrument Sans, DM Mono), then a
  // requestAnimationFrame so the paint settles before measurement,
  // THEN restore. behavior: 'instant' — no perceived scroll.
  useEffect(() => {
    let cancelled = false
    const restore = () => {
      if (cancelled) return
      try {
        const anchorId = sessionStorage.getItem(SCROLL_ANCHOR_ID_KEY)
        const anchorOffsetStr = sessionStorage.getItem(SCROLL_ANCHOR_OFFSET_KEY)
        if (anchorId && anchorOffsetStr !== null) {
          const el =
            document.querySelector(
              `[data-i18n-anchor="${CSS.escape(anchorId)}"]`,
            ) || document.getElementById(anchorId)
          if (el) {
            const rect = el.getBoundingClientRect()
            const target =
              window.scrollY + rect.top - parseFloat(anchorOffsetStr)
            window.scrollTo({ top: target, behavior: 'instant' })
          }
          sessionStorage.removeItem(SCROLL_ANCHOR_ID_KEY)
          sessionStorage.removeItem(SCROLL_ANCHOR_OFFSET_KEY)
          sessionStorage.removeItem(SCROLL_RESTORE_KEY)
          sessionStorage.removeItem(SCROLL_RATIO_KEY)
          return
        }
        const ratioStr = sessionStorage.getItem(SCROLL_RATIO_KEY)
        if (ratioStr !== null) {
          const ratio = parseFloat(ratioStr)
          const target =
            ratio *
            Math.max(
              1,
              document.documentElement.scrollHeight - window.innerHeight,
            )
          window.scrollTo({ top: target, behavior: 'instant' })
          sessionStorage.removeItem(SCROLL_RATIO_KEY)
          sessionStorage.removeItem(SCROLL_RESTORE_KEY)
          return
        }
        const saved = sessionStorage.getItem(SCROLL_RESTORE_KEY)
        if (saved !== null) {
          sessionStorage.removeItem(SCROLL_RESTORE_KEY)
          const y = parseInt(saved, 10)
          if (!Number.isNaN(y)) window.scrollTo({ top: y, behavior: 'instant' })
        }
      } catch {
        // private browsing / disabled storage — ignore.
      }
    }

    const fontsReady =
      typeof document !== 'undefined' && 'fonts' in document
        ? document.fonts.ready
        : Promise.resolve()

    fontsReady.then(() => {
      requestAnimationFrame(restore)
    })

    return () => {
      cancelled = true
    }
  }, [])

  function pick(next: Lang) {
    if (next === lang) return
    setLanguage(next)
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.langRow} role="group" aria-label="Language">
        <button
          type="button"
          className={`${styles.langOption} ${lang === 'en' ? styles.active : ''}`}
          onClick={() => pick('en')}
          aria-pressed={lang === 'en'}
        >
          English
        </button>
        <span className={styles.langSeparator} aria-hidden="true">·</span>
        <button
          type="button"
          className={`${styles.langOption} ${lang === 'es' ? styles.active : ''}`}
          onClick={() => pick('es')}
          aria-pressed={lang === 'es'}
        >
          Español
        </button>
      </div>

      <div className={styles.brandLine}>
        Autoplier · <a href="mailto:contact@landofiguanas.com">contact@landofiguanas.com</a> · <Link href="/privacy">{t.landingFooterPrivacy}</Link> · <Link href="/terms">{t.landingFooterTerms}</Link>
      </div>
    </footer>
  )
}
