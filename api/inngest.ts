import { serve } from 'inngest/node'
import '../lib/observability/sentryServer'
import { inngest } from '../inngest/client'
import { stockMonitor }    from '../inngest/functions/stockMonitor'
import { cashFlowForecast }from '../inngest/functions/cashFlowForecast'
import { pushDigest }      from '../inngest/functions/pushDigest'
import { fraudDetector }   from '../inngest/functions/fraudDetector'
import { resetDemoTenant } from '../inngest/functions/resetDemoTenant'
import { stripeEventProcessor } from '../inngest/functions/stripeEventProcessor'
import { billingGraceEnforcement } from '../inngest/functions/billingGraceEnforcement'
import { webhookDispatcher } from '../inngest/functions/webhookDispatcher'

export default serve({
  client: inngest,
  functions: [
    stockMonitor,
    cashFlowForecast,
    pushDigest,
    fraudDetector,
    resetDemoTenant,
    stripeEventProcessor,
    billingGraceEnforcement,
    webhookDispatcher,
  ],
})
