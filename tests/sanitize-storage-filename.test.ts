import { describe, it, expect } from 'vitest'
import { sanitizeStorageFileName } from '../utils/storage'

describe('sanitizeStorageFileName', () => {
  it('sanitizes filename with spaces and accents to key-safe string', () => {
    const input = 'Captura de ecrã 2026-04-29, às 18.23.28.png'
    const out = sanitizeStorageFileName(input)
    expect(out).toBe('captura-de-ecra-2026-04-29-as-18-23-28.png')
    expect(out).not.toMatch(/\s/)
    expect(out).toMatch(/\.png$/)
  })

  it('keeps extension content and lowercases it', () => {
    expect(sanitizeStorageFileName('file.pdf')).toBe('file.pdf')
    expect(sanitizeStorageFileName('a.b.c.ZIP')).toBe('a-b-c.zip')
  })

  it('replaces spaces and punctuation with hyphens', () => {
    expect(sanitizeStorageFileName('a b c.txt')).toBe('a-b-c.txt')
    expect(sanitizeStorageFileName('a,b(c).txt')).toBe('a-b-c.txt')
  })

  it('allows only lowercase alphanumeric, underscore, hyphen in base', () => {
    expect(sanitizeStorageFileName('Valid_Name-1.x')).toBe('valid_name-1.x')
  })

  it('returns "attachment" when base would be empty after sanitize', () => {
    expect(sanitizeStorageFileName('???')).toBe('attachment')
    expect(sanitizeStorageFileName('.pdf')).toBe('attachment.pdf')
  })

  it('truncates base and extension to safe lengths', () => {
    const longBase = 'A'.repeat(100)
    const longExt = 'B'.repeat(20)
    const out = sanitizeStorageFileName(`${longBase}.${longExt}`)
    expect(out).toBe(`${'a'.repeat(80)}.${'b'.repeat(12)}`)
  })
})
