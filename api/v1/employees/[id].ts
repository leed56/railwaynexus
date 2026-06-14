import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../../lib/tenantApi/http'
import { EMPLOYEE_PATCH_KEYS, validateEmployeePatch } from '../../../lib/tenantApi/employeeApi'

const EMPLOYEE_FIELDS = [
  'id', 'company_id', 'department_id', 'employee_number', 'first_name', 'last_name',
  'email', 'phone', 'job_title', 'employment_type', 'status', 'hire_date',
  'basic_salary', 'epf_no', 'annual_leave_balance', 'medical_leave_balance', 'casual_leave_balance',
  'created_at', 'updated_at',
  'departments(name)',
].join(', ')

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const parts = path.split('/').filter(Boolean)
  const id = parts[parts.length - 1]

  if (!id || id === 'employees') {
    sendJson(res, 400, { error: 'Employee id required' })
    return
  }

  const auth = await authenticateApiRequest(
    req,
    method === 'GET' ? 'employees:read' : 'employees:write',
  )

  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error })
    return
  }

  const { ctx } = auth

  try {
    if (method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .select(EMPLOYEE_FIELDS)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Employee not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }

      sendJson(res, 200, { data })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(req)
      const validationError = validateEmployeePatch(body)
      if (validationError) {
        sendJson(res, 400, { error: validationError })
        await logApiRequest(ctx, req, path, 400, started)
        return
      }

      const patch: Record<string, unknown> = {}
      for (const key of EMPLOYEE_PATCH_KEYS) {
        if (body[key] !== undefined) patch[key] = body[key]
      }

      if (patch.department_id) {
        const { data: dept, error: deptErr } = await supabaseAdmin
          .from('departments')
          .select('id')
          .eq('id', String(patch.department_id))
          .eq('company_id', ctx.companyId)
          .is('deleted_at', null)
          .maybeSingle()

        if (deptErr) throw deptErr
        if (!dept) {
          sendJson(res, 400, { error: 'department_id not found for this company' })
          await logApiRequest(ctx, req, path, 400, started)
          return
        }
      }

      const { data, error } = await supabaseAdmin
        .from('employees')
        .update(patch)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .select(EMPLOYEE_FIELDS)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Employee not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }

      sendJson(res, 200, { data })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
    await logApiRequest(ctx, req, path, 405, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}
