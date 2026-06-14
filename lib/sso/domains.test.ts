import { describe, expect, it } from 'vitest'
import { extractEmailDomain, normalizeDomain, parseDomainList } from './domains'

describe('sso domains', () => {
  it('normalizes domain casing', () => {
    expect(normalizeDomain('  Example.COM ')).toBe('example.com')
  })

  it('extracts email domain', () => {
    expect(extractEmailDomain('user@AHMGroup.lk')).toBe('ahmgroup.lk')
    expect(extractEmailDomain('invalid')).toBeNull()
  })

  it('parses comma-separated domains', () => {
    expect(parseDomainList('ahmgroup.lk, wheelslanka.com wheelslanka.com')).toEqual([
      'ahmgroup.lk',
      'wheelslanka.com',
    ])
  })
})
