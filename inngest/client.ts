import { Inngest } from 'inngest'
import { sentryMiddleware } from '@inngest/middleware-sentry'
import { initServerSentry, isServerSentryEnabled } from '../lib/observability/sentryServer'

initServerSentry()

const middleware = isServerSentryEnabled() ? [sentryMiddleware()] : []

export const inngest = new Inngest({ id: 'nexus-erp', middleware })

export function getClaudeModel(plan: string): string {
  if (plan === 'conglomerate') return 'claude-opus-4-8'
  if (plan === 'enterprise')   return 'claude-sonnet-4-6'
  return 'claude-haiku-4-5-20251001'
}

export const NEXUS_MIND_SYSTEM =
  'You are NEXUS MIND, an AI business intelligence engine for Sri Lankan enterprises. ' +
  'Respond ONLY in valid JSON matching the output_schema exactly. No markdown. No explanation. JSON only.'
