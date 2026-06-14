import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const fraudDetector = inngest.createFunction(
  { id: 'fraud-detector', name: 'Fraud Pattern Detector', triggers: [{ cron: '0 9 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let alertsCreated = 0

    for (const company of companies) {
      try {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        // Pattern 1: Duplicate journal lines — same account + same amount on same day
        const { data: dupeLines } = await supabaseAdmin
          .from('journal_lines')
          .select('account_id, debit, credit, journal_entries(entry_date, reference, posted_by)')
          .eq('journal_entries.company_id', company.id)
          .gte('journal_entries.entry_date', yesterday.toISOString().split('T')[0])

        if (dupeLines) {
          const seen = new Map<string, number>()
          for (const line of dupeLines) {
            const key = `${line.account_id}:${line.debit}:${line.credit}`
            seen.set(key, (seen.get(key) ?? 0) + 1)
          }
          for (const [key, count] of seen) {
            if (count < 2) continue
            const [accountId, debit] = key.split(':')
            const amount = parseFloat(debit) || 0
            if (amount < 1000) continue

            const existing = await supabaseAdmin
              .from('ai_alerts')
              .select('id')
              .eq('company_id', company.id)
              .eq('alert_type', 'fraud')
              .ilike('title', '%Duplicate%')
              .gte('created_at', yesterday.toISOString())
              .limit(1)

            if (existing.data?.length) continue

            await supabaseAdmin.from('ai_alerts').insert({
              company_id:        company.id,
              alert_type:        'fraud',
              severity:          'warning',
              title:             'Duplicate Journal Entry Detected',
              description:       `Account ${accountId.slice(0, 8)} has ${count} identical entries of LKR ${amount.toLocaleString()} posted today.`,
              ai_recommendation: 'Review recently posted journal entries. Verify with accountant before reversing.',
              data_snapshot:     { account_id: accountId, amount, duplicate_count: count },
            })
            alertsCreated++
          }
        }

        // Pattern 2: Off-hours journal postings (10PM–5AM)
        const { data: offHoursEntries } = await supabaseAdmin
          .from('journal_entries')
          .select('id, reference, created_at')
          .eq('company_id', company.id)
          .eq('status', 'posted')
          .gte('created_at', yesterday.toISOString())

        if (offHoursEntries) {
          const offHours = offHoursEntries.filter(e => {
            const hour = new Date(e.created_at).getHours()
            return hour >= 22 || hour < 5
          })
          if (offHours.length >= 2) {
            await supabaseAdmin.from('ai_alerts').insert({
              company_id:        company.id,
              alert_type:        'fraud',
              severity:          'warning',
              title:             `${offHours.length} Off-Hours Journal Postings`,
              description:       `${offHours.length} journal entries posted between 10PM–5AM. Refs: ${offHours.slice(0, 3).map(e => e.reference).join(', ')}.`,
              ai_recommendation: 'Verify these postings are authorised. Enable posting-hour restrictions in settings.',
              data_snapshot:     { count: offHours.length, refs: offHours.map(e => e.reference) },
            })
            alertsCreated++
          }
        }

        // Pattern 3: Multiple ESS requests from same employee summing above threshold in 3 days
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

        const { data: essRequests } = await supabaseAdmin
          .from('ess_requests')
          .select('employee_id, amount')
          .eq('company_id', company.id)
          .gte('created_at', threeDaysAgo.toISOString())
          .is('deleted_at', null)

        if (essRequests) {
          const employeeTotals = new Map<string, number>()
          for (const req of essRequests) {
            const prev = employeeTotals.get(req.employee_id) ?? 0
            employeeTotals.set(req.employee_id, prev + (req.amount ?? 0))
          }
          for (const [empId, total] of employeeTotals) {
            if (total <= 200000) continue

            await supabaseAdmin.from('ai_alerts').insert({
              company_id:        company.id,
              alert_type:        'fraud',
              severity:          'warning',
              title:             'Unusual ESS Request Pattern',
              description:       `Employee ${empId.slice(0, 8)} submitted LKR ${total.toLocaleString()} in ESS requests within 3 days.`,
              ai_recommendation: 'Review ESS requests for this employee before approval.',
              data_snapshot:     { employee_id: empId, total_amount: total, window_days: 3 },
            })
            alertsCreated++
          }
        }

        logger.info(`fraudDetector company=${company.id} alertsCreated=${alertsCreated}`)
      } catch (err) {
        logger.error(`fraudDetector failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, alertsCreated }
  }
)
