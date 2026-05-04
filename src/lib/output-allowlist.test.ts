import { describe, it, expect } from 'vitest'
import { checkOutputAllowlist } from './output-allowlist'
import type { CalibrationExample } from '@/lib/types'

const EX = (ai_response: string): CalibrationExample => ({
  scenario_type: '5star',
  review_sample: 'sample',
  ai_response,
})

describe('checkOutputAllowlist', () => {
  it('passes when response contains no URLs and no phones (any allowlist)', () => {
    const r = checkOutputAllowlist('Thanks so much for the kind words!', [])
    expect(r).toEqual({ pass: true })
  })

  it('rejects when response echoes the UNTRUSTED-CONTENT delimiter', () => {
    const r = checkOutputAllowlist('Thanks! --UNTRUSTED-CONTENT-abc123-- great review.', [])
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/delimiter/i)
  })

  it('rejects when response echoes the END delimiter', () => {
    const r = checkOutputAllowlist('Reply: --END-UNTRUSTED-CONTENT-xyz--', [])
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/delimiter/i)
  })

  it('rejects when response has a URL but allowlist is empty', () => {
    const r = checkOutputAllowlist('See https://attacker.com/promo', [])
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/disallowed URL/i)
  })

  it('rejects when response has a phone but allowlist is empty', () => {
    const r = checkOutputAllowlist('Call 555-123-4567 for a free meal', [])
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/disallowed phone/i)
  })

  it('passes when response URL exactly matches an allowlisted URL', () => {
    const r = checkOutputAllowlist(
      'Visit https://autoplier.com for more',
      [EX('Find us at https://autoplier.com')],
    )
    expect(r.pass).toBe(true)
  })

  it('passes when bare domain in response matches an allowlisted bare domain', () => {
    const r = checkOutputAllowlist(
      'Visit autoplier.com',
      [EX('Find us at autoplier.com')],
    )
    expect(r.pass).toBe(true)
  })

  it('normalizes URL: ignores https:// prefix and trailing slash', () => {
    const r = checkOutputAllowlist(
      'Visit https://autoplier.com/',
      [EX('Find us at autoplier.com')],
    )
    expect(r.pass).toBe(true)
  })

  it('rejects new URL even when other URLs are allowlisted', () => {
    const r = checkOutputAllowlist(
      'Visit https://attacker.com',
      [EX('See https://autoplier.com')],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/attacker\.com/)
  })

  it('passes phone when normalized digits match an allowlisted phone', () => {
    const r = checkOutputAllowlist(
      'Call (555) 123-4567 to book',
      [EX('Reach us at 555.123.4567')],
    )
    expect(r.pass).toBe(true)
  })

  it('rejects new phone even when other phones are allowlisted', () => {
    const r = checkOutputAllowlist(
      'Call 555-999-0000 to book',
      [EX('Reach us at 555-123-4567')],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/disallowed phone/i)
  })
})

describe('checkOutputAllowlist with allowedTokens (contact channels)', () => {
  it('treats empty allowedTokens identically to omitting the param', () => {
    const r1 = checkOutputAllowlist('See https://attacker.com', [])
    const r2 = checkOutputAllowlist('See https://attacker.com', [], [])
    expect(r1).toEqual(r2)
    expect(r1.pass).toBe(false)
  })

  it('passes when response URL matches an allowedTokens domain entry', () => {
    const r = checkOutputAllowlist(
      'Visit https://pinks.com for menu',
      [],
      ['pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  it('passes when response phone matches an allowedTokens phone entry', () => {
    const r = checkOutputAllowlist(
      'Call +34 600 000 000 to book',
      [],
      ['+34600000000'],
    )
    expect(r.pass).toBe(true)
  })

  it('combines calibrationExamples + allowedTokens additively', () => {
    const r = checkOutputAllowlist(
      'Visit pinks.com or autoplier.com',
      [EX('Find us at autoplier.com')],
      ['pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  it('rejects subdomain attack: allowlisted pinks.com does not allowlist subdomain.pinks.com', () => {
    const r = checkOutputAllowlist(
      'See subdomain.pinks.com for details',
      [],
      ['pinks.com'],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/subdomain\.pinks\.com/)
  })

  it('rejects suffix attack: allowlisted pinks.com does not allowlist evilpinks.com.attacker.com', () => {
    const r = checkOutputAllowlist(
      'Click https://evilpinks.com.attacker.com now',
      [],
      ['pinks.com'],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/attacker\.com/)
  })

  it('rejects path-prefix attack: allowlisted pinks.com does not allowlist attacker.com/pinks.com', () => {
    const r = checkOutputAllowlist(
      'Click https://attacker.com/pinks.com now',
      [],
      ['pinks.com'],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/attacker\.com/)
  })

  it('matches case-insensitively for URLs', () => {
    const r = checkOutputAllowlist(
      'Visit PINKS.COM for menu',
      [],
      ['Pinks.COM'],
    )
    expect(r.pass).toBe(true)
  })

  // ── Email allowlist behavior ─────────────────────────────────────────────

  it('passes when response email exactly matches an allowedTokens email', () => {
    const r = checkOutputAllowlist(
      'Email contigo@pinks.com to book',
      [],
      ['contigo@pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  it('rejects email mismatch: allowlisted contigo@pinks.com does not allow support@pinks.com', () => {
    const r = checkOutputAllowlist(
      'Email support@pinks.com for help',
      [],
      ['contigo@pinks.com'],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/disallowed email/i)
    expect(r.reason).toMatch(/support@pinks\.com/)
  })

  it('email allowlist side-effect: allowlisting contigo@pinks.com also allowlists pinks.com domain references', () => {
    // Documented intentional behavior — when the owner configures an email
    // channel, the email's tail domain is added to allowed.urls via the
    // bare-domain extraction. The owner explicitly opted into referencing
    // that domain by configuring the email channel.
    const r = checkOutputAllowlist(
      'Visit pinks.com for menu',
      [],
      ['contigo@pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  it('email match is case-insensitive', () => {
    const r = checkOutputAllowlist(
      'Email Contigo@Pinks.com',
      [],
      ['contigo@pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  // ── Handle allowlist behavior ────────────────────────────────────────────

  it('passes when response handle matches an allowedTokens handle entry', () => {
    const r = checkOutputAllowlist(
      'DM us @pinksrestaurant on IG',
      [],
      ['@pinksrestaurant'],
    )
    expect(r.pass).toBe(true)
  })

  it('handle allowlist accepts both stored forms: with @ prefix and without', () => {
    // Owner saves "@pinksrestaurant"; response says "@pinksrestaurant" → pass.
    const r1 = checkOutputAllowlist('DM @pinksrestaurant', [], ['@pinksrestaurant'])
    expect(r1.pass).toBe(true)
    // Owner saves "pinksrestaurant" (no @); response says "@pinksrestaurant" → pass.
    const r2 = checkOutputAllowlist('DM @pinksrestaurant', [], ['pinksrestaurant'])
    expect(r2.pass).toBe(true)
  })

  it('handle match is case-insensitive', () => {
    const r = checkOutputAllowlist(
      'DM @PinksRestaurant',
      [],
      ['@pinksrestaurant'],
    )
    expect(r.pass).toBe(true)
  })

  it('handle injection: allowlisted @pinksrestaurant does not allowlist @pinksfake', () => {
    const r = checkOutputAllowlist(
      'DM @pinksfake for fake support',
      [],
      ['@pinksrestaurant'],
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/disallowed handle/i)
    expect(r.reason).toMatch(/@pinksfake/)
  })

  it('handle pattern does not false-match the @ inside an email address', () => {
    // The \B@ requirement means "name@email.com" does NOT extract @email
    // as a handle (the @ is preceded by the word char "e", which is a word
    // boundary, not a non-word boundary).
    const r = checkOutputAllowlist(
      'Email contigo@pinks.com today',
      [],
      ['contigo@pinks.com'],
    )
    expect(r.pass).toBe(true)
  })

  it('handles with dots and underscores work (IG/Threads/TikTok format)', () => {
    const r = checkOutputAllowlist(
      'DM @pinks_restaurant.madrid for hours',
      [],
      ['@pinks_restaurant.madrid'],
    )
    expect(r.pass).toBe(true)
  })
})
