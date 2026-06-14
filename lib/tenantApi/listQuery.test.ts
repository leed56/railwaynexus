import { describe, it, expect } from 'vitest'
import { parseListLimit } from './listQuery'

describe('parseListLimit', () => {
  it('defaults to 100', () => {
    expect(parseListLimit(new URL('http://x/'))).toBe(100)
  })

  it('caps at 500', () => {
    expect(parseListLimit(new URL('http://x/?limit=999'))).toBe(500)
  })

  it('floors invalid values to default', () => {
    expect(parseListLimit(new URL('http://x/?limit=abc'))).toBe(100)
    expect(parseListLimit(new URL('http://x/?limit=0'))).toBe(100)
  })
})
