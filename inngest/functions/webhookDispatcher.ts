import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'
import { buildWebhookHeaders } from '../../lib/webhooks/sign'

interface OutboxSubscription {
  id: string
  url: string
  secret: string
  name: string
}

interface OutboxItem {
  id: string
  tenant_id: string
  company_id: string
  event_type: string
  payload: Record<string, unknown>
  attempts: number
  subscriptions: OutboxSubscription[]
}

export const webhookDispatcher = inngest.createFunction(
  {
    id: 'webhook-dispatcher',
    name: 'Tenant Webhook Dispatcher',
    retries: 3,
    triggers: [{ cron: '*/1 * * * *' }],
  },
  async ({ logger }) => {
    const { data, error } = await supabaseAdmin.rpc('claim_webhook_outbox_batch', { p_limit: 25 })
    if (error) {
      logger.error('Failed to claim webhook outbox', { error: error.message })
      throw error
    }

    const result = data as { success?: boolean; items?: OutboxItem[] }
    const items = result.items ?? []
    if (!items.length) return { processed: 0 }

    let delivered = 0

    for (const item of items) {
      const body = JSON.stringify({
        id: item.id,
        type: item.event_type,
        created_at: new Date().toISOString(),
        data: item.payload,
      })

      const deliveries: Array<Record<string, unknown>> = []

      if (!item.subscriptions?.length) {
        await supabaseAdmin.rpc('complete_webhook_outbox', {
          p_outbox_id: item.id,
          p_deliveries: [],
        })
        continue
      }

      for (const sub of item.subscriptions) {
        const started = Date.now()
        try {
          const res = await fetch(sub.url, {
            method: 'POST',
            headers: buildWebhookHeaders(sub.secret, item.event_type, body),
            body,
            signal: AbortSignal.timeout(15_000),
          })

          const responseText = (await res.text()).slice(0, 2000)
          const ok = res.status >= 200 && res.status < 300

          deliveries.push({
            subscription_id: sub.id,
            status_code: res.status,
            response_body: responseText,
            duration_ms: Date.now() - started,
            status: ok ? 'success' : 'failed',
            attempts: item.attempts,
            last_error: ok ? null : `HTTP ${res.status}`,
          })

          if (ok) delivered += 1
        } catch (e) {
          deliveries.push({
            subscription_id: sub.id,
            status_code: null,
            response_body: null,
            duration_ms: Date.now() - started,
            status: item.attempts >= 5 ? 'dead' : 'failed',
            attempts: item.attempts,
            last_error: e instanceof Error ? e.message : 'Delivery failed',
          })
        }
      }

      await supabaseAdmin.rpc('complete_webhook_outbox', {
        p_outbox_id: item.id,
        p_deliveries: deliveries,
      })
    }

    logger.info('Webhook batch processed', { items: items.length, delivered })
    return { processed: items.length, delivered }
  },
)
