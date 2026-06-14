import * as Sentry from '@sentry/node'

let initialized = false

function appEnvironment(): string {
  return process.env.VERCEL_ENV ?? process.env.VITE_APP_ENV ?? process.env.NODE_ENV ?? 'development'
}

export function isServerSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim())
}

export function initServerSentry(): void {
  if (initialized) return
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: appEnvironment(),
    tracesSampleRate: appEnvironment() === 'production' ? 0.1 : 0.5,
  })
  initialized = true
}

export function captureServerException(
  error: Error,
  context: Record<string, unknown> = {},
): void {
  initServerSentry()
  if (!isServerSentryEnabled()) return

  Sentry.withScope(scope => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value)
    }
    Sentry.captureException(error)
  })
}
