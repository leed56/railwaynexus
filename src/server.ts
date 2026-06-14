import cors from 'cors'
import express, { type Request, type Response } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { serve as inngestServe } from 'inngest/express'
import { initServerSentry } from '../lib/observability/sentryServer'
import { inngest } from '../inngest/client'
import { stockMonitor } from '../inngest/functions/stockMonitor'
import { arAgingCheck } from '../inngest/functions/arAgingCheck'
import { cashFlowForecast } from '../inngest/functions/cashFlowForecast'
import { dailyScorecard } from '../inngest/functions/dailyScorecard'
import { pushDigest } from '../inngest/functions/pushDigest'
import { fraudDetector } from '../inngest/functions/fraudDetector'
import { resetDemoTenant } from '../inngest/functions/resetDemoTenant'
import { stripeEventProcessor } from '../inngest/functions/stripeEventProcessor'
import { billingGraceEnforcement } from '../inngest/functions/billingGraceEnforcement'
import { webhookDispatcher } from '../inngest/functions/webhookDispatcher'
import stripeWebhook from '../api/stripe-webhook'
import createCheckoutSession from '../api/create-checkout-session'
import createPortalSession from '../api/create-portal-session'
import ssoSync from '../api/sso/sync'
import contacts from '../api/v1/contacts'
import contactsById from '../api/v1/contacts/[id]'
import invoices from '../api/v1/invoices'
import invoicesById from '../api/v1/invoices/[id]'
import bills from '../api/v1/bills'
import billsById from '../api/v1/bills/[id]'
import employees from '../api/v1/employees'
import employeesById from '../api/v1/employees/[id]'
import inventoryItems from '../api/v1/inventory-items'
import inventoryItemsById from '../api/v1/inventory-items/[id]'

type ApiHandler = (
  req: IncomingMessage & { method?: string },
  res: ServerResponse,
) => Promise<void>

function adapt(handler: ApiHandler) {
  return (req: Request, res: Response) => handler(req, res)
}

function corsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGINS ?? process.env.APP_URL ?? ''
  const origins = raw.split(',').map(s => s.trim()).filter(Boolean)
  return origins.length ? origins : true
}

initServerSentry()

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.disable('x-powered-by')
app.use(cors({ origin: corsOrigins(), credentials: true }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'railwaynexus',
    timestamp: new Date().toISOString(),
  })
})

app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  adapt(stripeWebhook),
)

app.post('/api/create-checkout-session', adapt(createCheckoutSession))
app.post('/api/create-portal-session', adapt(createPortalSession))
app.post('/api/sso/sync', adapt(ssoSync))

app.use(
  '/api/inngest',
  inngestServe({
    client: inngest,
    functions: [
      stockMonitor,
      arAgingCheck,
      cashFlowForecast,
      dailyScorecard,
      pushDigest,
      fraudDetector,
      resetDemoTenant,
      stripeEventProcessor,
      billingGraceEnforcement,
      webhookDispatcher,
    ],
  }),
)

app.all('/api/v1/contacts', adapt(contacts))
app.all('/api/v1/contacts/:id', adapt(contactsById))
app.all('/api/v1/invoices', adapt(invoices))
app.all('/api/v1/invoices/:id', adapt(invoicesById))
app.all('/api/v1/bills', adapt(bills))
app.all('/api/v1/bills/:id', adapt(billsById))
app.all('/api/v1/employees', adapt(employees))
app.all('/api/v1/employees/:id', adapt(employeesById))
app.all('/api/v1/inventory-items', adapt(inventoryItems))
app.all('/api/v1/inventory-items/:id', adapt(inventoryItemsById))

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(port, () => {
  console.log(`railwaynexus listening on port ${port}`)
})
