'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SCROLL_RESTORE_KEY, setLanguage, useTranslation } from '@/lib/i18n-client'
import type { Lang } from '@/lib/i18n'
import styles from './footer.module.css'

// Shared site footer. Two rows:
//   1. Language switch (English · Español) — discrete, near-black at ~40% /
//      ~80% opacity for inactive / active. No borders, no background.
//   2. Brand line — "Autoplier · contact@autoplier.com · Privacy".
//
// Client component on purpose: useTranslation reads the cookie via
// document.cookie + useEffect. Brief flash to default language is
// acceptable here because the footer sits below the fold on most
// pages — the hydration delta is invisible during normal scrolling.

export function Footer() {
  const { t, lang } = useTranslation()
  const router = useRouter()

  // Restore scroll after a language switch. Covers the hard-reload path
  // (sessionStorage seeded by setLanguage). The same-tab soft-refresh
  // path is also covered inside setLanguage itself, so this effect is
  // a belt-and-suspenders fallback.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SCROLL_RESTORE_KEY)
      if (saved !== null) {
        sessionStorage.removeItem(SCROLL_RESTORE_KEY)
        const y = parseInt(saved, 10)
        if (!Number.isNaN(y)) window.scrollTo(0, y)
      }
    } catch {
      // private browsing / disabled storage — ignore.
    }
  }, [])

  function pick(next: Lang) {
    if (next === lang) return
    setLanguage(next, router)
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
        Autoplier · <a href="mailto:contact@autoplier.com">contact@autoplier.com</a> · <Link href="/privacy">{t.landingFooterPrivacy}</Link> · <Link href="/terms">{t.landingFooterTerms}</Link>
      </div>
    </footer>
  )
}
