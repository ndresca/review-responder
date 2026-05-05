// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrandVoiceFields } from './BrandVoiceFields'

// Defaults that satisfy required props. Individual tests pass overrides
// for the fields they care about.
const defaults = {
  mode: 'flat' as const,
  ownerDescription: '',
  onOwnerDescriptionChange: () => {},
  personality: '',
  onPersonalityChange: () => {},
  avoid: '',
  onAvoidChange: () => {},
  language: 'en',
  onLanguageChange: () => {},
  autoLang: false,
  onAutoLangChange: () => {},
}

describe('<BrandVoiceFields />', () => {
  // 1
  it('renders all five controls (textarea + 2 inputs + select + toggle)', () => {
    render(<BrandVoiceFields {...defaults} />)
    // Brand voice description — multi-line textarea
    const desc = screen.getByLabelText(/brand voice|voz de marca/i, { selector: 'textarea' })
    expect(desc).toBeTruthy()
    expect(desc.tagName).toBe('TEXTAREA')
    // Personality + avoid — single-line inputs
    const personality = screen.getByLabelText(/personality|personalidad/i)
    expect(personality.tagName).toBe('INPUT')
    expect((personality as HTMLInputElement).type).toBe('text')
    const avoid = screen.getByLabelText(/avoid|evitar/i)
    expect(avoid.tagName).toBe('INPUT')
    // Language select
    const lang = screen.getByLabelText(/language|idioma/i, { selector: 'select' })
    expect(lang.tagName).toBe('SELECT')
    // Auto-detect toggle (role=switch)
    expect(screen.getByRole('switch')).toBeTruthy()
  })

  // 2
  it('ownerDescription is a multi-line textarea, not an input', () => {
    render(<BrandVoiceFields {...defaults} />)
    const desc = screen.getByLabelText(/brand voice|voz de marca/i, { selector: 'textarea' }) as HTMLTextAreaElement
    expect(desc.tagName).toBe('TEXTAREA')
    expect(desc.rows).toBe(5)
  })

  // 3
  it('typing in each field calls the matching onChange callback', () => {
    const onOwnerDescriptionChange = vi.fn()
    const onPersonalityChange = vi.fn()
    const onAvoidChange = vi.fn()
    const onLanguageChange = vi.fn()
    const onAutoLangChange = vi.fn()
    render(
      <BrandVoiceFields
        {...defaults}
        onOwnerDescriptionChange={onOwnerDescriptionChange}
        onPersonalityChange={onPersonalityChange}
        onAvoidChange={onAvoidChange}
        onLanguageChange={onLanguageChange}
        onAutoLangChange={onAutoLangChange}
      />,
    )
    fireEvent.change(screen.getByLabelText(/brand voice|voz de marca/i, { selector: 'textarea' }), { target: { value: 'a long story' } })
    expect(onOwnerDescriptionChange).toHaveBeenCalledWith('a long story')

    fireEvent.change(screen.getByLabelText(/personality|personalidad/i), { target: { value: 'warm' } })
    expect(onPersonalityChange).toHaveBeenCalledWith('warm')

    fireEvent.change(screen.getByLabelText(/avoid|evitar/i), { target: { value: 'corporate-speak' } })
    expect(onAvoidChange).toHaveBeenCalledWith('corporate-speak')

    fireEvent.change(screen.getByLabelText(/language|idioma/i, { selector: 'select' }), { target: { value: 'es' } })
    expect(onLanguageChange).toHaveBeenCalledWith('es')

    fireEvent.click(screen.getByRole('switch'))
    expect(onAutoLangChange).toHaveBeenCalledWith(true)
  })

  // 4
  it('autoLang toggle reflects current value via aria-checked', () => {
    const { rerender } = render(<BrandVoiceFields {...defaults} autoLang={false} />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    rerender(<BrandVoiceFields {...defaults} autoLang={true} />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  // 5
  it('shows Required + Optional badges in onboarding mode', () => {
    render(<BrandVoiceFields {...defaults} mode="onboarding" />)
    // Required badges appear on description + language; optional badges
    // on personality + avoid + autoLang. Match the EN/ES badge text
    // (currently the bare word "required" / "optional" rendered inside
    // a styled span — see onbStep2FieldRequired / onbStep2FieldOptional).
    const requiredBadges = screen.getAllByText(/^required$|^requerido$/i)
    expect(requiredBadges.length).toBeGreaterThanOrEqual(2)
    const optionalBadges = screen.getAllByText(/^optional$|^opcional$/i)
    expect(optionalBadges.length).toBeGreaterThanOrEqual(3)
  })

  // 6
  it('hides Required + Optional badges in flat mode', () => {
    render(<BrandVoiceFields {...defaults} mode="flat" />)
    expect(screen.queryByText(/^required$|^requerido$/i)).toBeNull()
    expect(screen.queryByText(/^optional$|^opcional$/i)).toBeNull()
  })

  // 7
  it('renders an inline error under ownerDescription when errors.ownerDescription is set', () => {
    render(
      <BrandVoiceFields
        {...defaults}
        errors={{ ownerDescription: 'Describe your brand voice in your own words.' }}
      />,
    )
    expect(screen.getByText(/describe your brand voice/i)).toBeTruthy()
    const desc = screen.getByLabelText(/brand voice|voz de marca/i, { selector: 'textarea' })
    expect(desc.getAttribute('aria-invalid')).toBe('true')
  })

  // 8
  it('respects idPrefix to avoid id collisions when used multiple times', () => {
    const { container } = render(<BrandVoiceFields {...defaults} idPrefix="panel" />)
    expect(container.querySelector('#panel-owner-description')).toBeTruthy()
    expect(container.querySelector('#panel-personality')).toBeTruthy()
    expect(container.querySelector('#panel-avoid')).toBeTruthy()
    expect(container.querySelector('#panel-language')).toBeTruthy()
    // Default 'bvf' prefix should not be present.
    expect(container.querySelector('#bvf-owner-description')).toBeNull()
  })
})
