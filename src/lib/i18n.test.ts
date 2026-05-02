import { describe, it, expect } from 'vitest'
import { parseLang, getTranslation, EN, ES } from './i18n'

describe('parseLang', () => {
  it('returns "es" for raw "es"', () => {
    expect(parseLang('es')).toBe('es')
  })

  it('returns "en" for raw "en"', () => {
    expect(parseLang('en')).toBe('en')
  })

  it('returns "en" for undefined / null / unknown values', () => {
    expect(parseLang(undefined)).toBe('en')
    expect(parseLang(null)).toBe('en')
    expect(parseLang('fr')).toBe('en')
    expect(parseLang('')).toBe('en')
  })
})

describe('getTranslation', () => {
  it('returns English dictionary for "en"', () => {
    expect(getTranslation('en')).toBe(EN)
  })

  it('returns Spanish dictionary for "es"', () => {
    expect(getTranslation('es')).toBe(ES)
  })
})
