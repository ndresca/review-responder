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
