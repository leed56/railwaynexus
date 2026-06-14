import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const PENDING_MIGRATIONS = [
  '038_governance_g4.sql',
  '039_audit_trail_s1.sql',
  '040_observer_auth_repair.sql',
  '041_observer_auth_clone.sql',
  '042_observer_brief_scoped.sql',
  '043_industry_i3.sql',
  '044_roles_v2.sql',
] as const

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function migrationSecret(): string | undefined {
  return process.env.MIGRATION_SECRET ?? process.env.SUPABASE_MIGRATION_SECRET
}

function dbUrl(): string | undefined {
  return process.env.SUPABASE_DB_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL
}

function isAuthorized(req: IncomingMessage): boolean {
  const secret = migrationSecret()
  if (!secret) return false

  const header = req.headers.authorization
  if (header === `Bearer ${secret}`) return true

  const alt = req.headers['x-migration-secret']
  return typeof alt === 'string' && alt === secret
}

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse,
) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const connectionString = dbUrl()
  if (!connectionString) {
    sendJson(res, 503, {
      error: 'SUPABASE_DB_URL not configured',
      hint: 'Add Supabase database URL to Vercel env, or run scripts/apply-pending-migrations.sh locally.',
    })
    return
  }

  let body: Record<string, unknown> = {}
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const only = Array.isArray(body.migrations)
    ? (body.migrations as string[]).filter(name => PENDING_MIGRATIONS.includes(name as typeof PENDING_MIGRATIONS[number]))
    : [...PENDING_MIGRATIONS]

  if (only.length === 0) {
    sendJson(res, 400, { error: 'No valid migrations requested' })
    return
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
  })

  const applied: string[] = []

  try {
    await client.connect()

    for (const file of only) {
      const sql = readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
      await client.query(sql)
      applied.push(file)
    }

    await client.query("NOTIFY pgrst, 'reload schema'")

    sendJson(res, 200, {
      success: true,
      applied,
      message: 'Pending migrations applied. Reload Audit Trail in the app.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Migration failed'
    sendJson(res, 500, {
      error: message,
      applied,
      hint: 'Apply supabase/migrations/039_audit_trail_s1.sql via Supabase SQL Editor (GitHub → Raw, not URL) if this endpoint fails.',
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}
