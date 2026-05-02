'use client'

// Client-only i18n: useTranslation hook (reads document.cookie) and
// setLanguage (writes cookie + soft-refreshes RSC). Lives in its own file
// so the dictionaries in src/lib/i18n.ts stay server-safe.

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

const FADE_MS = 150

type SoftRouter = { refresh: () => void }

// Soft language switch:
//   1. Add .lang-switching to <html> — globals.css fades main > *:not(footer)
//      to opacity 0 over FADE_MS.
//   2. After the fade-out, write the cookie and call router.refresh() so the
//      RSC tree (which reads autoplier_lang via next/headers cookies()) is
//      re-fetched with the new language.
//   3. Remove .lang-switching one frame after the refresh kicks off so the
//      new HTML has had a chance to swap in before opacity returns to 1.
//
// router.refresh() is the right primitive: it invalidates the RSC cache and
// re-renders server components without a hard reload, picking up the new
// cookie value. If the swap ever shows stale content during the fade-in,
// fall back to router.push(window.location.pathname + window.location.search)
// to force a soft re-fetch with the same effect minus the white flash.
export function setLanguage(next: Lang, router: SoftRouter): void {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  const html = document.documentElement

  html.classList.add('lang-switching')

  window.setTimeout(() => {
    document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
    router.refresh()
    requestAnimationFrame(() => {
      html.classList.remove('lang-switching')
    })
  }, FADE_MS)
}
