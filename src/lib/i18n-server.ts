// Server-only i18n: read the language cookie via next/headers and return
// the matching dictionary. Used by RSC pages (e.g. landing, privacy).

import { cookies } from 'next/headers'
import { LANG_COOKIE, type Lang, type Translation, getTranslation, parseLang } from '@/lib/i18n'

export async function getServerTranslation(): Promise<{ t: Translation; lang: Lang }> {
  const store = await cookies()
  const lang = parseLang(store.get(LANG_COOKIE)?.value)
  return { t: getTranslation(lang), lang }
}
