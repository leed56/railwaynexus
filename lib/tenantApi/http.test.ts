import { describe, it, expect } from 'vitest'
import { parsePathId } from './http'

describe('parsePathId', () => {
  it('returns null for collection path', () => {
    expect(parsePathId(new URL('http://x/api/v1/contacts'))).toBeNull()
  })

  it('returns id for resource path', () => {
    expect(parsePathId(new URL('http://x/api/v1/contacts/abc-123'))).toBe('abc-123')
  })
})
