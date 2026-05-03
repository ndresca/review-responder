'use client'

// Client-only i18n: useTranslation hook (reads document.cookie) and
// setLanguage (writes cookie + hard-navigates the same path so the RSC
// tree fully re-renders with the new language). Lives in its own file so
// the dictionaries in src/lib/i18n.ts stay server-safe.

import { useEffect, useState } from 'react'
import { LANG_COOKIE, type Lang, type Translation, getTranslation, parseLang } from '@/lib/i18n'

export const SCROLL_RESTORE_KEY = 'scroll_restore'

function readLangCookie(): Lang {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/(?:^|;\s*)autoplier_lang=([^;]+)/)
  return parseLang(match?.[1])
}

export function useTranslation(): { t: Translation; lang: Lang } {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    // Sync local state to cookie on mount. setLanguage triggers a hard
    // navigation, so this effect re-runs on every language switch via
    // the natural unmount/remount cycle. The storage listener keeps
    // multi-tab edits in sync without forcing a reload.
    const read = () => setLang(readLangCookie())
    read()
    window.addEventListener('storage', read)
    return () => window.removeEventListener('storage', read)
  }, [])

  return { t: getTranslation(lang), lang }
}

// Hard-navigation language switch:
//   1. Snapshot scrollY into sessionStorage so the post-reload Footer
//      effect can restore it.
//   2. Write the autoplier_lang cookie.
//   3. Reload via window.location.href = pathname + search. The browser
//      issues a fresh request, the server reads the new cookie via
//      next/headers cookies(), and every component remounts cleanly.
// Visual flash is masked by the landing page's fade-in wrapper.
export function setLanguage(next: Lang): void {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365

  try {
    sessionStorage.setItem(SCROLL_RESTORE_KEY, String(window.scrollY))
  } catch {
    // sessionStorage can throw in private browsing; fall through.
  }

  document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
  window.location.href = window.location.pathname + window.location.search
}
