import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const billingGraceEnforcement = inngest.createFunction(
  { id: 'billing-grace-enforcement', name: 'Suspend tenants after billing grace expires', triggers: [{ cron: '0 2 * * *' }] },
  async ({ logger }) => {
    const { data, error } = await supabaseAdmin.rpc('billing_enforce_grace_periods')

    if (error) {
      logger.error('Billing grace enforcement failed', { error: error.message })
      throw error
    }

    const result = data as { suspended_count?: number }
    logger.info('Billing grace enforcement complete', { suspended: result?.suspended_count ?? 0 })
    return data
  },
)
