import { describe, it, expect } from 'vitest'
import { hasScope } from './scopes'

describe('tenantApi scopes', () => {
  it('hasScope returns true when scope present', () => {
    expect(hasScope(['contacts:read', 'invoices:read'], 'contacts:read')).toBe(true)
  })

  it('hasScope returns false when scope missing', () => {
    expect(hasScope(['invoices:read'], 'contacts:write')).toBe(false)
    expect(hasScope(['bills:read'], 'employees:read')).toBe(false)
  })
})
