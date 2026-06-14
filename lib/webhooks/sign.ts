import { createHmac } from 'node:crypto'

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  const payload = `${timestamp}.${body}`
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function buildWebhookHeaders(
  secret: string,
  eventType: string,
  body: string,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signWebhookPayload(secret, timestamp, body)
  return {
    'Content-Type': 'application/json',
    'X-Nexus-Event': eventType,
    'X-Nexus-Timestamp': timestamp,
    'X-Nexus-Signature': `sha256=${signature}`,
    'User-Agent': 'NexusERP-Webhooks/1.0',
  }
}
