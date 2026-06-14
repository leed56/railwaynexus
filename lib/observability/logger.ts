export type LogLevel = 'info' | 'warn' | 'error'

export interface LogFields {
  event: string
  level: LogLevel
  ts: string
  request_id?: string
  handler?: string
  method?: string
  path?: string
  tenant_id?: string
  company_id?: string
  status_code?: number
  duration_ms?: number
  error?: string
  [key: string]: unknown
}

function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload: LogFields = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function logInfo(event: string, fields: Record<string, unknown> = {}) {
  write('info', event, fields)
}

export function logWarn(event: string, fields: Record<string, unknown> = {}) {
  write('warn', event, fields)
}

export function logError(event: string, fields: Record<string, unknown> = {}) {
  write('error', event, fields)
}
