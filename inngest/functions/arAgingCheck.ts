import Anthropic from '@anthropic-ai/sdk'
import { inngest, getClaudeModel, NEXUS_MIND_SYSTEM } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function contactName(contacts: unknown): string {
  if (Array.isArray(contacts)) {
    return (contacts[0] as { name?: string } | undefined)?.name ?? 'Unknown'
  }
  return (contacts as { name?: string } | null)?.name ?? 'Unknown'
}

export const arAgingCheck = inngest.createFunction(
  { id: 'ar-aging-check', name: 'AR Aging Risk Check', triggers: [{ cron: '0 6 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name, tenants(plan)')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let alertsCreated = 0

    for (const company of companies) {
      try {
        const { data: overdueInvoices } = await supabaseAdmin
          .from('invoices')
          .select('id, total_amount, balance, due_date, contacts(name)')
          .eq('company_id', company.id)
          .eq('status', 'overdue')
          .is('deleted_at', null)
          .order('due_date')

        if (!overdueInvoices?.length) continue

        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (inv.balance ?? 0), 0)
        if (totalOverdue < 50000) continue

        const overdueData = overdueInvoices.map(inv => ({
          customer: contactName(inv.contacts),
          amount:   inv.balance,
          days_overdue: Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000),
        }))

        const plan = ((company.tenants as { plan: string }[] | null)?.[0]?.plan) ?? 'starter'
        const model = getClaudeModel(plan)

        const response = await anthropic.messages.create({
          model,
          max_tokens: 300,
          system: NEXUS_MIND_SYSTEM,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              task: 'ar_risk_score',
              data: { overdue_invoices: overdueData, total_overdue_lkr: totalOverdue },
              output_schema: {
                risk_score:          '0-100',
                risk_level:          'low|medium|high|critical',
                reason:              'max 200 chars',
                recommended_actions: 'string[] max 3',
              },
            }),
          }],
        })

        const parsed = JSON.parse((response.content[0] as { text: string }).text)
        if (parsed.risk_level === 'low') continue

        const severity = parsed.risk_level === 'critical' ? 'critical'
          : parsed.risk_level === 'high' ? 'warning' : 'info'

        await supabaseAdmin.from('ai_alerts').insert({
          company_id:        company.id,
          alert_type:        'ar_risk',
          severity,
          title:             `AR Risk Score ${parsed.risk_score}/100 — ${parsed.risk_level.toUpperCase()}`,
          description:       `LKR ${totalOverdue.toLocaleString()} overdue from ${overdueInvoices.length} invoices. ${parsed.reason}`,
          ai_recommendation: (parsed.recommended_actions as string[]).join(' · '),
          data_snapshot:     { risk_score: parsed.risk_score, total_overdue: totalOverdue, model_used: model },
        })
        alertsCreated++
      } catch (err) {
        logger.error(`arAgingCheck failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, alertsCreated }
  }
)
