import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const stockMonitor = inngest.createFunction(
  { id: 'stock-monitor', name: 'Stock Level Monitor', triggers: [{ cron: '0 */2 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let alertsCreated = 0

    for (const company of companies) {
      try {
        // Get items where current stock (sum of movements) is at or below reorder_level
        const { data: lowItems } = await supabaseAdmin
          .from('inventory_items')
          .select(`
            id, sku, name, reorder_level, cost_price,
            movements:inventory_movements(quantity)
          `)
          .eq('company_id', company.id)
          .eq('is_active', true)
          .is('deleted_at', null)

        if (!lowItems) continue

        for (const item of lowItems) {
          const currentStock = (item.movements as Array<{ quantity: number }>)
            .reduce((sum: number, m) => sum + (m.quantity ?? 0), 0)

          if (item.reorder_level == null || currentStock > item.reorder_level) continue

          const pct = item.reorder_level > 0 ? (currentStock / item.reorder_level) * 100 : 0
          const severity = pct <= 10 ? 'critical' : 'warning'

          const { data: existing } = await supabaseAdmin
            .from('ai_alerts')
            .select('id')
            .eq('company_id', company.id)
            .eq('alert_type', 'stock_low')
            .eq('is_dismissed', false)
            .ilike('title', `%${item.sku}%`)
            .limit(1)

          if (existing?.length) continue

          await supabaseAdmin.from('ai_alerts').insert({
            company_id:        company.id,
            alert_type:        'stock_low',
            severity,
            title:             `Low Stock: ${item.name} (${item.sku})`,
            description:       `Current stock: ${currentStock} units. Reorder level: ${item.reorder_level} units.`,
            ai_recommendation: 'Place purchase order immediately to replenish stock.',
            data_snapshot:     { item_id: item.id, current_stock: currentStock, reorder_level: item.reorder_level },
          })
          alertsCreated++
        }
      } catch (err) {
        logger.error(`stockMonitor failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, alertsCreated }
  }
)
