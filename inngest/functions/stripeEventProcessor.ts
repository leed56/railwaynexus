import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const stripeEventProcessor = inngest.createFunction(
  { id: 'stripe-event-processor', name: 'Process Stripe webhook event', triggers: [{ event: 'stripe/event.received' }] },
  async ({ event, logger }) => {
    const { event_id, event_type, payload } = event.data as {
      event_id: string
      event_type: string
      payload: Record<string, unknown>
    }

    const { data, error } = await supabaseAdmin.rpc('stripe_process_event', {
      p_event_id: event_id,
      p_event_type: event_type,
      p_payload: payload,
    })

    if (error) {
      logger.error('Stripe event processing failed', { error: error.message, event_id })
      throw error
    }

    logger.info('Stripe event processed', { event_id, event_type, result: data })
    return data
  },
)
