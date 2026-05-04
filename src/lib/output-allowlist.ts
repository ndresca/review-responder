// Post-generation validator. Rejects responses containing URLs, emails,
// phone numbers, or social handles that don't appear in known-good owner
// content (calibration examples + owner-allowlisted contact channels).
// Final defense layer — even if review-safety classification missed a
// prompt-injection attempt and the LLM emitted attacker-controlled text,
// this catches the most damaging payloads before they post publicly.

import type { CalibrationExample } from '@/lib/types'

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|app|biz|info|xyz|me|us|uk|eu|de|fr|es|it)\b/gi

// Phone-shaped strings: international (+44 ...), US (555-123-4567 / (555)
// 123-4567 / 5551234567), or 7+ consecutive digits with separators. Tuned
// for false positives — short numbers in prose ("table for 4", "10pm")
// won't match.
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,3}\d{3,4}|\b\d{7,}\b/g

// Email addresses (RFC-conforming-ish — covers the common shape).
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi

// @-prefixed social handles (Instagram, TikTok, Threads, Twitter, etc.).
// `\B@` requires a non-word-boundary before the @ so we don't false-match
// the @ inside an email like name@example.com (where the @ is preceded by
// a word character `e`, which IS a word boundary `\b`, so `\B@` skips it).
// Allows underscores and internal dots (a.b_c) which IG/Threads/TikTok use.
const HANDLE_PATTERN = /\B@[a-z0-9_]+(?:\.[a-z0-9_]+)*\b/gi

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

type ExtractedTokens = {
  urls: Set<string>
  phones: Set<string>
  emails: Set<string>
  handles: Set<string>
}

function extractTokens(text: string): ExtractedTokens {
  const urls = new Set<string>()
  const phones = new Set<string>()
  const emails = new Set<string>()
  const handles = new Set<string>()

  for (const m of text.match(URL_PATTERN) ?? []) {
    urls.add(normalizeUrl(m))
  }
  for (const m of text.match(BARE_DOMAIN_PATTERN) ?? []) {
    urls.add(normalizeUrl(m))
  }
  for (const m of text.match(PHONE_PATTERN) ?? []) {
    phones.add(normalizePhone(m))
  }
  for (const m of text.match(EMAIL_PATTERN) ?? []) {
    emails.add(normalizeEmail(m))
  }
  for (const m of text.match(HANDLE_PATTERN) ?? []) {
    handles.add(normalizeHandle(m))
  }

  return { urls, phones, emails, handles }
}

function normalizeUrl(raw: string): string {
  return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim()
}

// Strips the leading `@` so allowlist entries `"@pinksrestaurant"` and
// `"pinksrestaurant"` both match a response handle `@pinksrestaurant`.
function normalizeHandle(raw: string): string {
  return raw.toLowerCase().replace(/^@/, '')
}

/**
 * Checks whether the generated response only contains URLs, phones, emails,
 * and handles that already appear in the owner's calibration examples
 * (which the owner approved during onboarding) OR in the owner's allowlisted
 * contact channels (configured in settings).
 *
 * If both `calibrationExamples` and `allowedTokens` are empty, the allowlist
 * is empty: any URL/phone/email/handle in the response fails. That matches
 * the spirit of the check (no approved owner content = no allowed external
 * references).
 *
 * `allowedTokens` is a flat string array — typically `contact_channels.map(c
 * => c.value)`. Each entry is fed through the same `extractTokens` pipeline
 * as the response itself, so a stored value `"hello@pinks.com"` allowlists
 * BOTH the email `hello@pinks.com` AND the bare domain `pinks.com` (the
 * email's tail). That's intentional — the owner explicitly opted into
 * referencing that domain by configuring the email channel.
 */
export function checkOutputAllowlist(
  response: string,
  calibrationExamples: CalibrationExample[],
  allowedTokens: string[] = [],
): OutputCheckResult {
  // Layer 4: delimiter echo. LLMs sometimes leak the per-request
  // UNTRUSTED-CONTENT-{uuid} delimiter into their output. We never want
  // those strings posted publicly — reject before any other check.
  if (containsDelimiterEcho(response)) {
    return { pass: false, reason: 'Response echoed prompt delimiter (UNTRUSTED-CONTENT) — likely model error' }
  }

  const responseTokens = extractTokens(response)

  if (
    responseTokens.urls.size === 0 &&
    responseTokens.phones.size === 0 &&
    responseTokens.emails.size === 0 &&
    responseTokens.handles.size === 0
  ) {
    return { pass: true }
  }

  // Build allowlist from owner-approved calibration text + owner-configured
  // contact channels. Both sources flow through the same `extractTokens`
  // pipeline so normalization is symmetric with the response side.
  const allowed = {
    urls: new Set<string>(),
    phones: new Set<string>(),
    emails: new Set<string>(),
    handles: new Set<string>(),
  }
  for (const ex of calibrationExamples) {
    const t = extractTokens(ex.ai_response)
    for (const u of t.urls) allowed.urls.add(u)
    for (const p of t.phones) allowed.phones.add(p)
    for (const e of t.emails) allowed.emails.add(e)
    for (const h of t.handles) allowed.handles.add(h)
  }
  for (const value of allowedTokens) {
    const t = extractTokens(value)
    for (const u of t.urls) allowed.urls.add(u)
    for (const p of t.phones) allowed.phones.add(p)
    for (const e of t.emails) allowed.emails.add(e)
    for (const h of t.handles) allowed.handles.add(h)
    // A handle stored without the @ prefix (e.g. "pinksrestaurant") wouldn't
    // be picked up by HANDLE_PATTERN's \B@ check. Catch this case explicitly
    // so the allowlist matches whether the owner saved the handle with or
    // without the leading @ — symmetric with normalizeHandle's strip.
    const trimmed = value.trim()
    if (/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/i.test(trimmed) && !trimmed.includes('@')) {
      allowed.handles.add(trimmed.toLowerCase())
    }
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
  for (const email of responseTokens.emails) {
    if (!allowed.emails.has(email)) {
      return { pass: false, reason: `Response contains disallowed email address: ${email}` }
    }
  }
  for (const handle of responseTokens.handles) {
    if (!allowed.handles.has(handle)) {
      return { pass: false, reason: `Response contains disallowed handle: @${handle}` }
    }
  }

  return { pass: true }
}
