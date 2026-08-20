import { describe, it, expect } from 'vitest'
import { parseCookies } from './cookies.js'

describe('parseCookies', () => {
  it('returns an empty object when there is no header', () => {
    expect(parseCookies(undefined)).toEqual({})
    expect(parseCookies('')).toEqual({})
  })

  it('parses a single cookie', () => {
    expect(parseCookies('sid=abc123')).toEqual({ sid: 'abc123' })
  })

  it('parses several cookies and trims the whitespace after each semicolon', () => {
    expect(parseCookies('sid=abc123; theme=dark; lang=bs')).toEqual({
      sid: 'abc123',
      theme: 'dark',
      lang: 'bs',
    })
  })

  it('keeps "=" characters inside a value', () => {
    // base64 padding is the case that matters in practice
    expect(parseCookies('sid=YWJjZA==')).toEqual({ sid: 'YWJjZA==' })
  })

  it('decodes percent-encoded values', () => {
    expect(parseCookies('name=Haris%20Begi%C4%87')).toEqual({ name: 'Haris Begić' })
  })

  it('survives a malformed escape instead of throwing', () => {
    // decodeURIComponent('%zz') throws URIError; a bad cookie must not 500 the
    // request, so we fall back to the raw value.
    expect(parseCookies('sid=%zz')).toEqual({ sid: '%zz' })
  })

  it('ignores empty segments and valueless entries', () => {
    expect(parseCookies('; sid=abc; ; broken; =nameless')).toEqual({ sid: 'abc' })
  })

  it('accepts an empty value', () => {
    expect(parseCookies('sid=')).toEqual({ sid: '' })
  })
})
