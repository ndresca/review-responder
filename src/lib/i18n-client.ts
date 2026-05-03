'use client'

// Client-only i18n: useTranslation hook (reads document.cookie) and
// setLanguage (writes cookie + soft-refreshes RSC). Lives in its own file
// so the dictionaries in src/lib/i18n.ts stay server-safe.

import { useEffect, useState } from 'react'
import { LANG_COOKIE, type Lang, type Translation, getTranslation, parseLang } from '@/lib/i18n'

const LANG_CHANGE_EVENT = 'autoplier:lang-change'

function readLangCookie(): Lang {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/(?:^|;\s*)autoplier_lang=([^;]+)/)
  return parseLang(match?.[1])
}

export function useTranslation(): { t: Translation; lang: Lang } {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    // Sync local state to cookie on mount, and again whenever setLanguage
    // fires the lang-change event. Without this, the client lang state is
    // pinned to its mount value while the cookie + RSC have moved on, so
    // the toggle's `if (next === lang) return` guard reads stale state and
    // refuses to switch back. Also listen to storage so multi-tab edits
    // stay in sync.
    const read = () => setLang(readLangCookie())
    read()
    window.addEventListener(LANG_CHANGE_EVENT, read)
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener(LANG_CHANGE_EVENT, read)
      window.removeEventListener('storage', read)
    }
  }, [])

  return { t: getTranslation(lang), lang }
}

const FADE_MS = 150

type SoftRouter = { refresh: () => void }

// Soft language switch:
//   1. Add .lang-switching to <html> — globals.css fades main > *:not(footer)
//      to opacity 0 over FADE_MS.
//   2. After the fade-out, write the cookie, dispatch the lang-change event
//      so client subscribers (Footer, anyone using useTranslation) re-read,
//      and call router.refresh() so the RSC tree (which reads
//      autoplier_lang via next/headers cookies()) re-renders.
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
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: next }))
    router.refresh()
    requestAnimationFrame(() => {
      html.classList.remove('lang-switching')
    })
  }, FADE_MS)
}
