import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../inngest/supabaseAdmin'
import { getStripe, getAppUrl, getUserFromAuthHeader } from '../lib/stripeServer'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const stripe = getStripe()
  if (!stripe) {
    sendJson(res, 503, { error: 'Stripe not configured' })
    return
  }

  const authHeader = req.headers.authorization ?? req.headers.Authorization
  const user = await getUserFromAuthHeader(typeof authHeader === 'string' ? authHeader : undefined)
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const { data: membership } = await supabaseAdmin
    .from('company_users')
    .select('companies(tenant_id, tenants(id, stripe_customer_id, is_demo))')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('role', ['platform_admin', 'tenant_superadmin', 'company_admin'])
    .limit(1)
    .single()

  type Row = {
    companies: {
      tenant_id: string
      tenants: { id: string; stripe_customer_id: string | null; is_demo: boolean } | null
    } | null
  }
  const tenant = (membership as Row | null)?.companies?.tenants

  if (!tenant?.stripe_customer_id) {
    sendJson(res, 400, { error: 'No Stripe customer — start a subscription first' })
    return
  }

  if (tenant.is_demo) {
    sendJson(res, 400, { error: 'Demo tenants use simulated billing' })
    return
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${getAppUrl()}/settings/subscription`,
  })

  sendJson(res, 200, { url: session.url })
}
