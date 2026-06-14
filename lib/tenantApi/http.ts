import type { IncomingMessage, ServerResponse } from 'node:http'

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
}

export function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? null
}

export function getClientIp(req: IncomingMessage): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null
  return req.socket?.remoteAddress ?? null
}

export function parsePathId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || last === 'contacts' || last === 'invoices') return null
  return last
}
