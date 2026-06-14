import type { IncomingMessage, ServerResponse } from 'node:http'
import { inngest } from '../inngest/client'
import { getStripe } from '../lib/stripeServer'

async function readRawBody(req: IncomingMessage & { body?: unknown }): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse,
) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Stripe not configured' }))
    return
  }

  const sig = req.headers['stripe-signature']
  if (!sig || Array.isArray(sig)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing signature' }))
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)

    await inngest.send({
      name: 'stripe/event.received',
      data: {
        event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      },
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ received: true }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid payload'
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
}

export const config = {
  api: { bodyParser: false },
}
