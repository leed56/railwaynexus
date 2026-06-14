import { inngest } from '../client'
import { supabaseAdmin } from '../supabaseAdmin'

export const pushDigest = inngest.createFunction(
  { id: 'push-digest', name: 'Daily Push Notification Digest', triggers: [{ cron: '0 8 * * *' }] },
  async ({ logger }) => {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .is('deleted_at', null)

    if (!companies?.length) return { processed: 0 }

    let digestsSent = 0

    for (const company of companies) {
      try {
        const since = new Date()
        since.setDate(since.getDate() - 1)

        const { data: alerts } = await supabaseAdmin
          .from('ai_alerts')
          .select('severity')
          .eq('company_id', company.id)
          .eq('is_dismissed', false)
          .gte('created_at', since.toISOString())

        if (!alerts?.length) continue

        const counts = { critical: 0, warning: 0, info: 0, good: 0 }
        for (const a of alerts) {
          if (a.severity in counts) counts[a.severity as keyof typeof counts]++
        }

        const body = [
          counts.critical > 0 ? `${counts.critical} critical` : '',
          counts.warning  > 0 ? `${counts.warning} warnings`  : '',
          counts.info     > 0 ? `${counts.info} info`         : '',
          counts.good     > 0 ? `${counts.good} good`         : '',
        ].filter(Boolean).join(' · ')

        // Get admin users of this company
        const { data: adminUsers } = await supabaseAdmin
          .from('company_users')
          .select('user_id')
          .eq('company_id', company.id)
          .in('role', ['company_admin', 'tenant_superadmin', 'platform_admin'])
          .eq('is_active', true)
          .is('deleted_at', null)

        if (!adminUsers?.length) continue

        // Get FCM tokens for admin users
        const userIds = adminUsers.map(u => u.user_id)
        const { data: tokens } = await supabaseAdmin
          .from('user_device_tokens')
          .select('fcm_token, user_id')
          .in('user_id', userIds)
          .eq('is_active', true)

        // Send FCM push (Firebase Admin SDK — requires env vars)
        if (tokens?.length && process.env.FIREBASE_PROJECT_ID) {
          const { cert, getApp, initializeApp } = await import('firebase-admin/app')
          const { getMessaging }                = await import('firebase-admin/messaging')

          let app
          try { app = getApp('nexus-erp') }
          catch {
            app = initializeApp({
              credential: cert({
                projectId:   process.env.FIREBASE_PROJECT_ID!,
                privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
              }),
            }, 'nexus-erp')
          }

          const messaging = getMessaging(app)
          await messaging.sendEachForMulticast({
            tokens: tokens.map(t => t.fcm_token),
            notification: { title: 'NEXUS MIND Daily', body: body || 'All systems normal' },
            data: { type: 'digest', company_id: company.id },
          })
        }

        // Insert in-app notifications for admin users
        const notifRows = userIds.map(uid => ({
          company_id:  company.id,
          user_id:     uid,
          type:        'digest' as const,
          title:       'NEXUS MIND Daily Digest',
          body:        body || 'All systems normal',
          sent_push:   !!(tokens?.length && process.env.FIREBASE_PROJECT_ID),
        }))
        await supabaseAdmin.from('notifications').insert(notifRows)

        digestsSent++
        logger.info(`pushDigest sent company=${company.id} counts=${JSON.stringify(counts)}`)
      } catch (err) {
        logger.error(`pushDigest failed for company ${company.id}`, { err })
      }
    }

    return { processed: companies.length, digestsSent }
  }
)
