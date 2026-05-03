'use client'

// Client-only i18n: useTranslation hook (reads document.cookie) and
// setLanguage (writes cookie + hard-navigates the same path so the RSC
// tree fully re-renders with the new language). Lives in its own file so
// the dictionaries in src/lib/i18n.ts stay server-safe.

import { useEffect, useState } from 'react'
import { LANG_COOKIE, type Lang, type Translation, getTranslation, parseLang } from '@/lib/i18n'

export const SCROLL_RESTORE_KEY = 'scroll_restore'
export const LANG_RESTORE_PATH_KEY = 'lang_restore_path'
export const SCROLL_ANCHOR_ID_KEY = 'scroll_anchor_id'
export const SCROLL_ANCHOR_OFFSET_KEY = 'scroll_anchor_offset'
export const SCROLL_RATIO_KEY = 'scroll_ratio'

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
//   1. Anchor-snapshot the topmost visible DOM element so we can re-find
//      it after the page rebuilds in the new language. Pixel scrollY
//      values aren't portable across languages — Spanish wraps to more
//      lines than English, so the saved Y lands on different content.
//      We also write a scroll_ratio fallback for when no anchor is in
//      view (e.g. fixed-position-only pages).
//   2. Write the autoplier_lang cookie synchronously.
//   3. Reload via window.location.href = pathname + search + hash. The
//      browser issues a fresh request, the server reads the new cookie
//      via next/headers cookies(), and every component remounts cleanly.
// Visual flash is masked by the global body fade-in in globals.css.
export function setLanguage(next: Lang): void {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365

  const fullPath =
    window.location.pathname + window.location.search + window.location.hash

  try {
    // Pixel scroll snapshot — kept as a last-resort fallback only.
    sessionStorage.setItem(SCROLL_RESTORE_KEY, String(window.scrollY))
    sessionStorage.setItem(LANG_RESTORE_PATH_KEY, fullPath)

    // Anchor snapshot. Pick the topmost element in the viewport that
    // either carries data-i18n-anchor (preferred, opted-in by the page)
    // or has a stable id. We pin its current viewport-top offset so the
    // restorer can compute target = anchorY - savedOffset, putting that
    // element back at the same relative position regardless of how the
    // ES copy reflows above it.
    const candidates = Array.from(
      document.querySelectorAll('[data-i18n-anchor], [id]'),
    ) as HTMLElement[]
    let bestAnchor: HTMLElement | null = null
    let bestTop = Infinity
    for (const el of candidates) {
      const rect = el.getBoundingClientRect()
      if (rect.top >= 0 && rect.top < bestTop) {
        bestTop = rect.top
        bestAnchor = el
      }
    }
    if (bestAnchor) {
      const id = bestAnchor.getAttribute('data-i18n-anchor') || bestAnchor.id
      sessionStorage.setItem(SCROLL_ANCHOR_ID_KEY, id)
      sessionStorage.setItem(SCROLL_ANCHOR_OFFSET_KEY, String(bestTop))
    } else {
      const ratio =
        window.scrollY /
        Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      sessionStorage.setItem(SCROLL_RATIO_KEY, String(ratio))
    }
  } catch {
    // sessionStorage can throw in private browsing; fall through.
  }

  document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
  window.location.href = fullPath
}
