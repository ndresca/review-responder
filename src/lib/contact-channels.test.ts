import { describe, it, expect } from 'vitest'
import { filterCompleteChannels } from './contact-channels'
import type { ContactChannel } from './types'

const CH = (overrides: Partial<ContactChannel> = {}): ContactChannel => ({
  id: 'fixture-id',
  label: 'Customer service',
  value: 'support@pinks.com',
  when_to_use: 'for negative reviews',
  ...overrides,
})

describe('filterCompleteChannels', () => {
  it('returns empty array for empty input', () => {
    expect(filterCompleteChannels([])).toEqual([])
  })

  it('keeps fully populated channels', () => {
    const channels = [CH(), CH({ id: 'b' })]
    const out = filterCompleteChannels(channels)
    expect(out).toHaveLength(2)
  })

  it('drops a row with empty label', () => {
    const channels = [CH({ label: '' }), CH({ id: 'b' })]
    const out = filterCompleteChannels(channels)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('b')
  })

  it('drops a row with empty value', () => {
    const channels = [CH(), CH({ id: 'b', value: '' })]
    const out = filterCompleteChannels(channels)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('fixture-id')
  })

  it('drops a row with empty when_to_use', () => {
    const channels = [CH(), CH({ id: 'b', when_to_use: '' })]
    const out = filterCompleteChannels(channels)
    expect(out).toHaveLength(1)
  })

  it('drops a row whose fields are whitespace-only', () => {
    // Mirrors the server validator's `.trim().length === 0` check —
    // whitespace-only fields are not considered "complete".
    const channels = [
      CH({ id: 'a', label: '   ' }),
      CH({ id: 'b', value: '\t\n  ' }),
      CH({ id: 'c', when_to_use: '  \n' }),
      CH({ id: 'd' }),
    ]
    const out = filterCompleteChannels(channels)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('d')
  })

  it('drops every row when all are partially typed (none complete)', () => {
    const channels = [
      CH({ id: 'a', value: '', when_to_use: '' }), // label only
      CH({ id: 'b', label: '', when_to_use: '' }), // value only
      CH({ id: 'c', label: '', value: '' }),       // when_to_use only
    ]
    expect(filterCompleteChannels(channels)).toEqual([])
  })

  it('preserves order of complete channels', () => {
    const channels = [
      CH({ id: 'first' }),
      CH({ id: 'partial', label: '' }),
      CH({ id: 'second' }),
    ]
    const out = filterCompleteChannels(channels)
    expect(out.map((c) => c.id)).toEqual(['first', 'second'])
  })
})
