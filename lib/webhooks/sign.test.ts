import { describe, it, expect } from 'vitest'
import { signWebhookPayload } from './sign'

describe('signWebhookPayload', () => {
  it('produces deterministic HMAC for same inputs', () => {
    const a = signWebhookPayload('whsec_test', '1710000000', '{"a":1}')
    const b = signWebhookPayload('whsec_test', '1710000000', '{"a":1}')
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
})
