'use client'

import { setLanguage, useTranslation } from '@/lib/i18n-client'
import styles from './language-toggle.module.css'

// Subtle text-only toggle. Shows "ES" when current language is English (clicks
// switch to Spanish), "EN" when current is Spanish. Same Instrument Sans
// nav styling as Settings/Dashboard back-links so it blends in rather than
// competing for attention.

export function LanguageToggle({ className }: { className?: string }) {
  const { t, lang } = useTranslation()
  const next = lang === 'en' ? 'es' : 'en'

  return (
    <button
      type="button"
      className={`${styles.toggle}${className ? ` ${className}` : ''}`}
      aria-label={lang === 'en' ? 'Cambiar a español' : 'Switch to English'}
      onClick={() => setLanguage(next)}
    >
      {t.langToggleLabel}
    </button>
  )
}
