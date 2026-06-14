import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const cashFlowForecast = inngest.createFunction(
  { id: 'cash-flow-forecast', name: 'Cash Flow Forecast', triggers: [{ cron: '30 6 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let alertsCreated = 0

    for (const company of companies) {
      try {
        const now = new Date()
        const in30  = new Date(now); in30.setDate(now.getDate() + 30)
        const in60  = new Date(now); in60.setDate(now.getDate() + 60)
        const in90  = new Date(now); in90.setDate(now.getDate() + 90)

        const [{ data: invoices30 }, { data: bills30 }] = await Promise.all([
          supabaseAdmin.from('invoices')
            .select('balance')
            .eq('company_id', company.id)
            .in('status', ['sent','overdue'])
            .lte('due_date', in30.toISOString().split('T')[0])
            .is('deleted_at', null),
          supabaseAdmin.from('bills')
            .select('balance')
            .eq('company_id', company.id)
            .in('status', ['received','overdue'])
            .lte('due_date', in30.toISOString().split('T')[0])
            .is('deleted_at', null),
        ])

        const inflow30  = (invoices30 ?? []).reduce((s, i) => s + (i.balance ?? 0), 0)
        const outflow30 = (bills30   ?? []).reduce((s, b) => s + (b.balance ?? 0), 0)
        const net30     = inflow30 - outflow30

        if (net30 >= 0) {
          // Positive cash flow — good alert
          await supabaseAdmin.from('ai_alerts').insert({
            company_id:        company.id,
            alert_type:        'cash_flow',
            severity:          'good',
            title:             'Cash Flow Positive — 30-Day Outlook',
            description:       `Expected net inflow of LKR ${Math.abs(net30).toLocaleString()} in the next 30 days.`,
            ai_recommendation: 'Consider short-term deposits for surplus. Keep AR collection on schedule.',
            data_snapshot:     { inflow: inflow30, outflow: outflow30, net: net30, window_days: 30 },
          })
        } else {
          await supabaseAdmin.from('ai_alerts').insert({
            company_id:        company.id,
            alert_type:        'cash_flow',
            severity:          Math.abs(net30) > 500000 ? 'critical' : 'warning',
            title:             `Cash Flow Warning — LKR ${Math.abs(net30).toLocaleString()} Shortfall`,
            description:       `Projected net outflow of LKR ${Math.abs(net30).toLocaleString()} in next 30 days. Inflow: ${inflow30.toLocaleString()}, Outflow: ${outflow30.toLocaleString()}.`,
            ai_recommendation: 'Accelerate collections, delay non-critical payments, review overdraft facility.',
            data_snapshot:     { inflow: inflow30, outflow: outflow30, net: net30, window_days: 30 },
          })
        }
        alertsCreated++

        logger.info(`cashFlowForecast company=${company.id} net30=${net30}`)
      } catch (err) {
        logger.error(`cashFlowForecast failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, alertsCreated }
  }
)
