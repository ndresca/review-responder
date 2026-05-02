// Post-generation validator. Rejects responses containing URLs or phone
// numbers that don't appear in known-good owner content (calibration
// examples). Final defense layer — even if review-safety classification
// missed a prompt-injection attempt and the LLM emitted attacker-controlled
// text, this catches the most damaging payloads before they post publicly.

import type { CalibrationExample } from '@/lib/types'

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|app|biz|info|xyz|me|us|uk|eu|de|fr|es|it)\b/gi

// Phone-shaped strings: international (+44 ...), US (555-123-4567 / (555)
// 123-4567 / 5551234567), or 7+ consecutive digits with separators. Tuned
// for false positives — short numbers in prose ("table for 4", "10pm")
// won't match.
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,3}\d{3,4}|\b\d{7,}\b/g

export type OutputCheckResult = {
  pass: boolean
  reason?: string
}

// Detects whether a generated response echoed the per-request UNTRUSTED-CONTENT
// delimiter back into its output. LLMs occasionally leak delimiters
// verbatim — without this check, a string like
// "--UNTRUSTED-CONTENT-d3f4...--" would land directly on a public Google
// review. The exact UUID isn't needed; the literal "--UNTRUSTED-CONTENT-"
// prefix is enough since that string is reserved for prompt internals.
const DELIMITER_ECHO = /--(?:END-)?UNTRUSTED-CONTENT-/i

export function containsDelimiterEcho(text: string): boolean {
  return DELIMITER_ECHO.test(text)
}

function extractTokens(text: string): { urls: Set<string>; phones: Set<string> } {
  const urls = new Set<string>()
  const phones = new Set<string>()

  for (const m of text.match(URL_PATTERN) ?? []) {
    urls.add(normalizeUrl(m))
  }
  for (const m of text.match(BARE_DOMAIN_PATTERN) ?? []) {
    urls.add(normalizeUrl(m))
  }
  for (const m of text.match(PHONE_PATTERN) ?? []) {
    phones.add(normalizePhone(m))
  }

  return { urls, phones }
}

function normalizeUrl(raw: string): string {
  return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Checks whether the generated response only contains URLs and phone numbers
 * that already appear in the owner's calibration examples (which the owner
 * approved during onboarding). Anything new is rejected — the response goes
 * to human review instead of auto-posting.
 *
 * If calibrationExamples is empty, the allowlist is empty: any URL or phone
 * in the response fails. That matches the spirit of the check (no approved
 * owner content = no allowed external references).
 */
export function checkOutputAllowlist(
  response: string,
  calibrationExamples: CalibrationExample[],
): OutputCheckResult {
  // Layer 4: delimiter echo. LLMs sometimes leak the per-request
  // UNTRUSTED-CONTENT-{uuid} delimiter into their output. We never want
  // those strings posted publicly — reject before any URL/phone check.
  if (containsDelimiterEcho(response)) {
    return { pass: false, reason: 'Response echoed prompt delimiter (UNTRUSTED-CONTENT) — likely model error' }
  }

  const responseTokens = extractTokens(response)

  if (responseTokens.urls.size === 0 && responseTokens.phones.size === 0) {
    return { pass: true }
  }

  // Build allowlist from owner-approved calibration text.
  const allowed = { urls: new Set<string>(), phones: new Set<string>() }
  for (const ex of calibrationExamples) {
    const t = extractTokens(ex.ai_response)
    for (const u of t.urls) allowed.urls.add(u)
    for (const p of t.phones) allowed.phones.add(p)
  }

  for (const url of responseTokens.urls) {
    if (!allowed.urls.has(url)) {
      return { pass: false, reason: `Response contains disallowed URL/domain: ${url}` }
    }
  }
  for (const phone of responseTokens.phones) {
    if (!allowed.phones.has(phone)) {
      return { pass: false, reason: `Response contains disallowed phone number: ${phone}` }
    }
  }

  return { pass: true }
}
