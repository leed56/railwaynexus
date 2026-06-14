import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export function createRequestId(): string {
  return randomUUID()
}

export function getRequestIdFromHeaders(req: IncomingMessage): string | null {
  const header = req.headers['x-request-id'] ?? req.headers['X-Request-Id']
  if (typeof header !== 'string') return null
  const trimmed = header.trim()
  return trimmed || null
}
