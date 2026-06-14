import Anthropic from '@anthropic-ai/sdk'
import { inngest, getClaudeModel, NEXUS_MIND_SYSTEM } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const dailyScorecard = inngest.createFunction(
  { id: 'daily-scorecard', name: 'Daily Business Scorecard', triggers: [{ cron: '0 7 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name, tenants(plan)')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let scoresGenerated = 0

    for (const company of companies) {
      try {
        const today = new Date().toISOString().split('T')[0]

        const { data: existing } = await supabaseAdmin
          .from('ai_daily_scores')
          .select('id')
          .eq('company_id', company.id)
          .eq('score_date', today)
          .limit(1)
        if (existing?.length) continue

        // Gather metrics
        const now = new Date()
        const thirtyDaysAgo = new Date(now)
        thirtyDaysAgo.setDate(now.getDate() - 30)
        const sixtyDaysAgo = new Date(now)
        sixtyDaysAgo.setDate(now.getDate() - 60)

        const [
          { data: bankAccounts },
          { data: overdueInvoices },
          { data: allInvoicesRecent },
          { data: allInvoicesPrev },
          { data: lowStockItems },
          { data: activeEmployees },
          { data: payrollRuns },
        ] = await Promise.all([
          supabaseAdmin.from('bank_accounts').select('current_balance').eq('company_id', company.id).is('deleted_at', null),
          supabaseAdmin.from('invoices').select('balance').eq('company_id', company.id).eq('status', 'overdue').is('deleted_at', null),
          supabaseAdmin.from('invoices').select('total_amount').eq('company_id', company.id).gte('created_at', thirtyDaysAgo.toISOString()).is('deleted_at', null),
          supabaseAdmin.from('invoices').select('total_amount').eq('company_id', company.id).gte('created_at', sixtyDaysAgo.toISOString()).lt('created_at', thirtyDaysAgo.toISOString()).is('deleted_at', null),
          supabaseAdmin.from('inventory_items').select('id').eq('company_id', company.id).eq('is_active', true).is('deleted_at', null),
          supabaseAdmin.from('employees').select('id').eq('company_id', company.id).eq('status', 'active').is('deleted_at', null),
          supabaseAdmin.from('payroll_runs').select('status').eq('company_id', company.id).eq('period_year', now.getFullYear()).eq('period_month', now.getMonth() + 1).is('deleted_at', null),
        ])

        const cashPosition   = (bankAccounts ?? []).reduce((s, b) => s + (b.current_balance ?? 0), 0)
        const arBalance      = (overdueInvoices ?? []).reduce((s, i) => s + (i.balance ?? 0), 0)
        const revenueRecent  = (allInvoicesRecent ?? []).reduce((s, i) => s + (i.total_amount ?? 0), 0)
        const revenuePrev    = (allInvoicesPrev  ?? []).reduce((s, i) => s + (i.total_amount ?? 0), 0)
        const revenueChange  = revenuePrev > 0 ? ((revenueRecent - revenuePrev) / revenuePrev) * 100 : 0
        const payrollOnTime  = (payrollRuns ?? []).some(r => r.status === 'paid')

        const metrics = {
          cash_position_lkr:    cashPosition,
          ar_overdue_lkr:       arBalance,
          low_stock_items:      lowStockItems?.length ?? 0,
          revenue_change_pct:   Math.round(revenueChange),
          payroll_on_time:      payrollOnTime,
          active_employees:     activeEmployees?.length ?? 0,
        }

        const plan    = ((company.tenants as { plan: string }[] | null)?.[0]?.plan) ?? 'starter'
        const model   = getClaudeModel(plan)

        const response = await anthropic.messages.create({
          model,
          max_tokens: 500,
          system: NEXUS_MIND_SYSTEM,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              task:          'daily_scorecard',
              company:       company.name,
              data:          { metrics },
              output_schema: {
                health_score:        '0-100 integer',
                cash_score:          '0-100 integer',
                ar_score:            '0-100 integer',
                inventory_score:     '0-100 integer',
                revenue_score:       '0-100 integer',
                staff_score:         '0-100 integer',
                narrative:           'max 250 chars string',
                top_risks:           'string[] max 3 items',
                recommended_actions: 'string[] max 3 items',
              },
            }),
          }],
        })

        const parsed = JSON.parse((response.content[0] as { text: string }).text)

        await supabaseAdmin.from('ai_daily_scores').upsert({
          company_id:         company.id,
          score_date:         today,
          health_score:       Math.max(0, Math.min(100, parsed.health_score)),
          cash_score:         Math.max(0, Math.min(100, parsed.cash_score)),
          ar_score:           Math.max(0, Math.min(100, parsed.ar_score)),
          inventory_score:    Math.max(0, Math.min(100, parsed.inventory_score)),
          revenue_score:      Math.max(0, Math.min(100, parsed.revenue_score)),
          staff_score:        Math.max(0, Math.min(100, parsed.staff_score)),
          summary:            parsed.narrative,
          top_risks:          parsed.top_risks,
          recommended_actions: parsed.recommended_actions,
          model_used:         model,
        }, { onConflict: 'company_id,score_date' })

        scoresGenerated++
        logger.info(`dailyScorecard company=${company.id} health=${parsed.health_score}`)
      } catch (err) {
        logger.error(`dailyScorecard failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, scoresGenerated }
  }
)
