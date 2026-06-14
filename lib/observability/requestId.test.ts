import { describe, it, expect } from 'vitest'
import { createRequestId, getRequestIdFromHeaders } from './requestId'

describe('requestId', () => {
  it('creates a UUID', () => {
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('reads x-request-id header', () => {
    const req = { headers: { 'x-request-id': 'abc-123' } }
    expect(getRequestIdFromHeaders(req as never)).toBe('abc-123')
  })

  it('returns null when header missing', () => {
    expect(getRequestIdFromHeaders({ headers: {} } as never)).toBeNull()
  })
})
