import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../inngest/supabaseAdmin'
import { getStripe, getAppUrl, getPriceIdForPlan, getUserFromAuthHeader } from '../lib/stripeServer'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
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

  const body = await readJsonBody(req)
  const plan = String(body.plan ?? 'professional')
  const priceId = getPriceIdForPlan(plan)

  const { data: membership } = await supabaseAdmin
    .from('company_users')
    .select('companies(tenant_id, tenants(id, name, stripe_customer_id, is_demo))')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('role', ['platform_admin', 'tenant_superadmin', 'company_admin'])
    .limit(1)
    .single()

  type Row = {
    companies: {
      tenant_id: string
      tenants: { id: string; name: string; stripe_customer_id: string | null; is_demo: boolean } | null
    } | null
  }
  const row = membership as Row | null
  const tenant = row?.companies?.tenants
  const tenantId = (body.tenant_id as string | undefined) ?? tenant?.id

  if (!tenantId) {
    sendJson(res, 400, { error: 'No tenant found' })
    return
  }

  if (tenant?.is_demo) {
    sendJson(res, 400, { error: 'Demo tenants use simulated billing — open Platform Billing console' })
    return
  }

  if (!priceId) {
    sendJson(res, 503, { error: `Price not configured for plan: ${plan}` })
    return
  }

  let customerId = tenant?.stripe_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: tenant?.name ?? undefined,
      metadata: { tenant_id: tenantId },
    })
    customerId = customer.id
    await supabaseAdmin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', tenantId)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${getAppUrl()}/settings/subscription?checkout=success`,
    cancel_url: `${getAppUrl()}/settings/subscription?checkout=cancel`,
    metadata: { tenant_id: tenantId, plan },
    subscription_data: { metadata: { tenant_id: tenantId, plan } },
  })

  sendJson(res, 200, { url: session.url })
}
