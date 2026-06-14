import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const resetDemoTenant = inngest.createFunction(
  { id: 'reset-demo-tenant', name: 'Reset Nexus Demo Sandbox', triggers: [{ cron: '0 3 * * *' }] },
  async ({ logger }) => {
    const { data, error } = await supabaseAdmin.rpc('reset_demo_tenant')

    if (error) {
      logger.error('Demo reset failed', { error: error.message })
      throw error
    }

    logger.info('Demo tenant reset complete', { result: data })
    return data
  },
)
