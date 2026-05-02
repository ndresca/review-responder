'use client'

// Client-only i18n: useTranslation hook (reads document.cookie) and
// setLanguage (writes cookie + reloads). Lives in its own file so the
// dictionaries in src/lib/i18n.ts stay server-safe.

import { useEffect, useState } from 'react'
import { LANG_COOKIE, type Lang, type Translation, getTranslation, parseLang } from '@/lib/i18n'

export function useTranslation(): { t: Translation; lang: Lang } {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    if (typeof document === 'undefined') return
    const match = document.cookie.match(/(?:^|;\s*)autoplier_lang=([^;]+)/)
    setLang(parseLang(match?.[1]))
  }, [])

  return { t: getTranslation(lang), lang }
}

// Write the cookie (1y, SameSite=Lax) and reload so every component picks
// up the new dictionary in one consistent render pass.
export function setLanguage(next: Lang): void {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
  window.location.reload()
}
